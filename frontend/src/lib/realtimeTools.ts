import {
  createTask,
  deleteTask,
  getTaskGroup,
  listTasks,
  parseTaskStatus,
  TASK_STATUS_LABELS,
  toNaiveDateTime,
  updateTask,
} from "@/lib/tasks"
import { api } from "@/lib/api"
import { assetUrl } from "@/lib/apiBase"
import { buildReportFromSession } from "@/lib/buildReportFromSession"
import { normalizePrestamoParams, resolvePrestamoPeriodPhrase } from "@/lib/prestamoPeriod"
import { pushSessionToolData } from "@/lib/sessionToolData"
import { notifyTasksChanged } from "@/lib/taskEvents"
import { formatToolResultMarkdown } from "@/lib/toolResultMarkdown"

type RealtimeEvent = {
  type?: string
  name?: string
  call_id?: string
  arguments?: string
  item?: {
    type?: string
    name?: string
    call_id?: string
    arguments?: string
  }
  response?: {
    output?: Array<{
      type?: string
      name?: string
      call_id?: string
      arguments?: string
    }>
  }
}

type CreateTaskArgs = {
  title?: unknown
  description?: unknown
  due_at?: unknown
  dueAt?: unknown
  notify_at?: unknown
  notifyAt?: unknown
}

const sendEvent = (channel: RTCDataChannel, payload: unknown) => {
  if (channel.readyState !== "open") {
    return
  }
  channel.send(JSON.stringify(payload))
}

const sendToolResult = (channel: RTCDataChannel, callId: string, output: unknown) => {
  sendEvent(channel, {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(output),
    },
  })
  sendEvent(channel, { type: "response.create" })
}

type ToolRunResult = {
  output: Record<string, unknown>
  context?: { resource?: string }
} | null

const finishTool = (
  channel: RTCDataChannel,
  callId: string,
  output: Record<string, unknown>,
  context?: { resource?: string },
): ToolRunResult => {
  sendToolResult(channel, callId, output)
  return { output, context }
}

const parseDueAt = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }
  return toNaiveDateTime(value)
}

const parseTaskArgs = (
  raw: string,
): { title: string; description: string; dueAt: string | null; notifyAt?: string | null } | null => {
  try {
    const parsed = JSON.parse(raw) as CreateTaskArgs
    const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
    const description = typeof parsed.description === "string" ? parsed.description.trim() : ""
    if (!title) {
      return null
    }
    const notifyRaw = parsed.notify_at ?? parsed.notifyAt
    return {
      title,
      description,
      dueAt: parseDueAt(parsed.due_at ?? parsed.dueAt),
      notifyAt: notifyRaw === undefined ? undefined : parseDueAt(typeof notifyRaw === "string" ? notifyRaw : null),
    }
  } catch {
    return null
  }
}

const runCreateTask = async (channel: RTCDataChannel, callId: string, rawArgs: string): Promise<ToolRunResult> => {
  const args = parseTaskArgs(rawArgs)
  if (!args) {
    return finishTool(channel, callId, {
      ok: false,
      message: "Faltó el título de la tarea",
    })
  }

  try {
    const { task } = await createTask(args.title, args.description, args.dueAt, "pending", args.notifyAt)
    notifyTasksChanged()
    return finishTool(channel, callId, {
      ok: true,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
      notifyAt: task.notifyAt,
    })
  } catch (error) {
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo crear la tarea",
    })
  }
}

const parseListDate = (raw: string): string | undefined => {
  try {
    const parsed = JSON.parse(raw) as { date?: unknown }
    if (typeof parsed.date !== "string") {
      return undefined
    }
    const trimmed = parsed.date.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
    const resolved = resolvePrestamoPeriodPhrase(trimmed)
    if (resolved?.fecha) {
      return resolved.fecha
    }
  } catch {
    // sin fecha: listar todas
  }
  return undefined
}

const runListTasks = async (channel: RTCDataChannel, callId: string, rawArgs: string): Promise<ToolRunResult> => {
  const date = parseListDate(rawArgs)
  try {
    const { tasks } = await listTasks(date)
    return finishTool(channel, callId, {
      ok: true,
      tasks: tasks.slice(0, 30).map((task) => {
        const status = task.status ?? "pending"
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          dueAt: task.dueAt,
          notifyAt: task.notifyAt,
          status,
          statusLabel: TASK_STATUS_LABELS[status],
          group: getTaskGroup(task.dueAt),
        }
      }),
    })
  } catch (error) {
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudieron leer las tareas",
    })
  }
}

const parseTaskId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === "string") {
    const id = Number(value.trim())
    if (Number.isInteger(id) && id > 0) {
      return id
    }
  }
  return null
}

const findTaskById = async (id: number) => {
  const { tasks } = await listTasks()
  return tasks.find((task) => task.id === id) ?? null
}

const runUpdateTask = async (channel: RTCDataChannel, callId: string, rawArgs: string): Promise<ToolRunResult> => {
  let parsed: {
    task_id?: unknown
    id?: unknown
    title?: unknown
    description?: unknown
    due_at?: unknown
    dueAt?: unknown
    notify_at?: unknown
    notifyAt?: unknown
    status?: unknown
  }
  try {
    parsed = JSON.parse(rawArgs) as {
      task_id?: unknown
      id?: unknown
      title?: unknown
      description?: unknown
      due_at?: unknown
      dueAt?: unknown
      notify_at?: unknown
      notifyAt?: unknown
      status?: unknown
    }
  } catch {
    return finishTool(channel, callId, { ok: false, message: "No se pudieron leer los datos" })
  }

  const id = parseTaskId(parsed.task_id ?? parsed.id)
  if (!id) {
    return finishTool(channel, callId, {
      ok: false,
      message: "Faltó el id de la tarea. Llama list_tasks primero.",
    })
  }

  try {
    const existing = await findTaskById(id)
    if (!existing) {
      return finishTool(channel, callId, { ok: false, message: "Tarea no encontrada" })
    }

    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : existing.title
    const description =
      typeof parsed.description === "string" ? parsed.description.trim() : existing.description
    const dueRaw = parsed.due_at ?? parsed.dueAt
    const dueAt =
      typeof dueRaw === "string" && dueRaw.trim() ? parseDueAt(dueRaw) : existing.dueAt

    if (typeof dueRaw === "string" && dueRaw.trim() && !dueAt) {
      return finishTool(channel, callId, {
        ok: false,
        message: "La fecha y hora no son válidas",
      })
    }

    const status = parsed.status !== undefined ? parseTaskStatus(parsed.status) : existing.status
    if (parsed.status !== undefined && !status) {
      return finishTool(channel, callId, {
        ok: false,
        message: "El estado debe ser pendiente, completada, cancelada o archivada",
      })
    }

    const notifyRaw = parsed.notify_at ?? parsed.notifyAt
    let notifyAt = existing.notifyAt
    if (notifyRaw !== undefined) {
      notifyAt =
        typeof notifyRaw === "string" && notifyRaw.trim() ? parseDueAt(notifyRaw) : null
      if (typeof notifyRaw === "string" && notifyRaw.trim() && !notifyAt) {
        return finishTool(channel, callId, {
          ok: false,
          message: "La hora de aviso no es válida",
        })
      }
    }

    const { task } = await updateTask(id, {
      title,
      description,
      dueAt,
      notifyAt,
      status: status ?? existing.status,
    })
    notifyTasksChanged()
    return finishTool(channel, callId, {
      ok: true,
      id: task.id,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
      notifyAt: task.notifyAt,
      status: task.status,
    })
  } catch (error) {
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar la tarea",
    })
  }
}

const runDeleteTask = async (channel: RTCDataChannel, callId: string, rawArgs: string): Promise<ToolRunResult> => {
  let parsed: { task_id?: unknown; id?: unknown }
  try {
    parsed = JSON.parse(rawArgs) as { task_id?: unknown; id?: unknown }
  } catch {
    return finishTool(channel, callId, { ok: false, message: "No se pudieron leer los datos" })
  }

  const id = parseTaskId(parsed.task_id ?? parsed.id)
  if (!id) {
    return finishTool(channel, callId, {
      ok: false,
      message: "Faltó el id de la tarea. Llama list_tasks primero.",
    })
  }

  try {
    const existing = await findTaskById(id)
    if (!existing) {
      return finishTool(channel, callId, { ok: false, message: "Tarea no encontrada" })
    }

    await deleteTask(id)
    notifyTasksChanged()
    return finishTool(channel, callId, {
      ok: true,
      id,
      title: existing.title,
    })
  } catch (error) {
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo eliminar la tarea",
    })
  }
}

type QueryPrestamoArgs = {
  resource?: unknown
  params?: Record<string, unknown>
}

const PRESTAMO_RESOURCE_SLUGS: Record<string, string> = {
  "caja-chica": "caja-chica",
  "caja-chica-detalle": "caja-chica-detalle",
  ingresos: "ingresos",
  egresos: "egresos",
  desembolsos: "desembolsos",
  resumen: "resumen",
  "cuotas-vencidas": "cuotas-vencidas",
  cuotas: "cuotas",
  creditos: "creditos",
  clientes: "clientes",
  pagos: "pagos",
  liquidez: "liquidez",
}

const toQueryString = (params: Record<string, unknown> | undefined): string => {
  if (!params) {
    return ""
  }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }
    const text = String(value).trim()
    if (text) {
      search.set(key, text)
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

const PRESTAMO_QUERY_TIMEOUT_MS = 20_000

const periodFromResult = (
  data: unknown,
  params: Record<string, unknown> | undefined,
): { fechaInicio?: string; fechaFin?: string } | undefined => {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : undefined
  const fechaInicio =
    (typeof payload?.fechaInicio === "string" && payload.fechaInicio) ||
    (typeof params?.fechaInicio === "string" && params.fechaInicio) ||
    (typeof params?.fecha === "string" && params.fecha) ||
    undefined
  const fechaFin =
    (typeof payload?.fechaFin === "string" && payload.fechaFin) ||
    (typeof params?.fechaFin === "string" && params.fechaFin) ||
    (typeof params?.fecha === "string" && params.fecha) ||
    undefined

  if (!fechaInicio && !fechaFin) {
    return undefined
  }

  return { fechaInicio, fechaFin }
}

const enrichPrestamoResult = (
  result: Record<string, unknown>,
  resource: string,
  params: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const periodoConsultado = periodFromResult(result.data, params)
  return {
    ...result,
    resource,
    periodoConsultado,
    instruccion:
      "Responde solo con los datos de esta respuesta y periodoConsultado. No combines ni sumes con consultas anteriores de la conversación.",
  }
}

const MOTIVO_HISTORIAL_KEYS = [
  "id",
  "monto",
  "capital",
  "interes",
  "motivo",
  "tipo",
  "origen",
  "destino",
  "fecha",
  "registradoPorNombre",
] as const

const slimHistorialRow = (item: unknown): unknown => {
  if (!item || typeof item !== "object") {
    return item
  }
  const source = item as Record<string, unknown>
  const row: Record<string, unknown> = {}
  for (const key of MOTIVO_HISTORIAL_KEYS) {
    if (key === "motivo") {
      const raw = source.motivo
      row.motivo =
        typeof raw === "string" && raw.trim() ? raw.trim() : raw === null || raw === undefined ? null : String(raw)
      continue
    }
    if (key in source) {
      row[key] = source[key]
    }
  }
  if (!("motivo" in row)) {
    row.motivo = null
  }
  return row
}

const slimHistorialList = (list: unknown): unknown =>
  Array.isArray(list) ? list.map(slimHistorialRow) : list

const trimPrestamoData = (resource: string, data: unknown): unknown => {
  if (!data || typeof data !== "object") {
    return data
  }

  if (resource === "ingresos" || resource === "egresos") {
    const copy = { ...(data as Record<string, unknown>) }
    if (resource === "ingresos" && "ingresos" in copy) {
      copy.ingresos = slimHistorialList(copy.ingresos)
    }
    if (resource === "egresos" && "egresos" in copy) {
      copy.egresos = slimHistorialList(copy.egresos)
    }
    return copy
  }

  if (resource !== "caja-chica-detalle") {
    return data
  }

  const copy = structuredClone(data) as Record<string, unknown>
  for (const key of [
    "ingresosCapitales",
    "ingresosVarios",
    "gastosEmpresa",
    "egresosVarios",
    "egresosPagoPlanillas",
    "egresosCuotasRetiros",
    "capitalizacionInteresIngresos",
    "capitalizacionInteresEgresos",
  ] as const) {
    if (key in copy) {
      copy[key] = slimHistorialList(copy[key])
    }
  }
  for (const key of ["creditosDesembolsados", "creditosDesembolsadosEstadisticas"] as const) {
    const list = copy[key]
    if (!Array.isArray(list)) {
      continue
    }
    copy[key] = list.map((item) => {
      if (!item || typeof item !== "object") {
        return item
      }
      const credito = { ...(item as Record<string, unknown>) }
      delete credito.cuotas
      return credito
    })
  }
  return copy
}

const queryPrestamoApi = async (slug: string, params: Record<string, unknown> | undefined) => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PRESTAMO_QUERY_TIMEOUT_MS)
  try {
    return await api<Record<string, unknown>>(
      `/api/integrations/prestamo/${slug}${toQueryString(params)}`,
      { signal: controller.signal },
    )
  } finally {
    window.clearTimeout(timer)
  }
}

const runQueryPrestamo = async (channel: RTCDataChannel, callId: string, raw: string): Promise<ToolRunResult> => {
  try {
    const parsed = JSON.parse(raw) as QueryPrestamoArgs
    const resource = typeof parsed.resource === "string" ? parsed.resource.trim() : ""
    const slug = PRESTAMO_RESOURCE_SLUGS[resource]
    if (!slug) {
      return finishTool(channel, callId, {
        ok: false,
        message: "resource inválido para query_prestamo",
      })
    }

    const params = normalizePrestamoParams(parsed.params)

    const result = await queryPrestamoApi(slug, params)
    if (result.ok && result.data !== undefined) {
      return finishTool(
        channel,
        callId,
        enrichPrestamoResult(
          {
            ...result,
            data: trimPrestamoData(resource, result.data),
          },
          resource,
          params,
        ),
        { resource },
      )
    }
    return finishTool(channel, callId, enrichPrestamoResult(result, resource, params))
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "La consulta a Atlas tardó demasiado"
        : error instanceof Error
          ? error.message
          : "No se pudo consultar Atlas"
    return finishTool(channel, callId, {
      ok: false,
      message,
    })
  }
}

type RealtimeToolHandlers = {
  onHangUp?: () => void
  onToolStart?: (name: string) => void
  onToolEnd?: (name: string) => void
  onAwaitingResponse?: () => void
  shouldEndCall?: () => boolean
  onReportGenerated?: (report: { url: string; fileName: string; title: string }) => void
  onStructuredChat?: (markdown: string) => void
}

const publishStructuredChat = (
  toolName: string,
  result: ToolRunResult,
  handlers?: RealtimeToolHandlers,
) => {
  if (!result) {
    return
  }
  if (toolName === "list_tasks" || toolName === "query_prestamo") {
    pushSessionToolData(toolName, result.output)
  }
  const markdown = formatToolResultMarkdown(toolName, result.output)
  if (markdown) {
    handlers?.onStructuredChat?.(markdown)
  }
}

const tryParseToolArgs = (rawArgs: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(rawArgs) as unknown
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
  } catch {
    // A veces el modelo manda JSON casi válido; intentamos el primer objeto {...}
    const start = rawArgs.indexOf("{")
    const end = rawArgs.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(rawArgs.slice(start, end + 1)) as unknown
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
      } catch {
        return null
      }
    }
    return null
  }
}

const runGenerateReportPdf = async (
  channel: RTCDataChannel,
  callId: string,
  rawArgs: string,
  handlers?: RealtimeToolHandlers,
): Promise<ToolRunResult> => {
  const parsed = tryParseToolArgs(rawArgs) ?? {}

  const title = typeof parsed.title === "string" ? parsed.title.trim() : undefined
  const subtitle = typeof parsed.subtitle === "string" ? parsed.subtitle.trim() : undefined
  const fileName = typeof parsed.fileName === "string" ? parsed.fileName : undefined
  const sourceRaw = typeof parsed.source === "string" ? parsed.source.trim().toLowerCase() : "last"
  const source =
    sourceRaw === "tasks" || sourceRaw === "prestamo" || sourceRaw === "all" || sourceRaw === "last"
      ? sourceRaw
      : "last"

  // Preferir datos de la sesión (fiable). Solo usar report embebido si viene completo y válido.
  const embedded = parsed.report
  let report: unknown = null

  if (embedded && typeof embedded === "object") {
    const asReport = embedded as { title?: unknown; sections?: unknown }
    if (typeof asReport.title === "string" && Array.isArray(asReport.sections) && asReport.sections.length > 0) {
      report = embedded
    }
  }

  if (!report) {
    const built = buildReportFromSession({ title, subtitle, source })
    if ("error" in built) {
      console.warn("[Isi] generate_report_pdf sin datos de sesión", {
        argsLen: rawArgs.length,
        source,
        message: built.error,
      })
      return finishTool(channel, callId, { ok: false, message: built.error })
    }
    report = built.report
  }

  try {
    const result = await api<{
      ok?: boolean
      url?: string
      fileName?: string
      title?: string
      bytes?: number
      message?: string
    }>("/api/reports/pdf", {
      method: "POST",
      body: JSON.stringify({
        report,
        fileName,
      }),
    })

    if (!result.ok || !result.url || !result.fileName || !result.title) {
      return finishTool(channel, callId, {
        ok: false,
        message: result.message ?? "No se pudo generar el PDF",
      })
    }

    const url = assetUrl(result.url)
    handlers?.onReportGenerated?.({
      url,
      fileName: result.fileName,
      title: result.title,
    })

    return finishTool(channel, callId, {
      ok: true,
      url,
      fileName: result.fileName,
      title: result.title,
      bytes: result.bytes,
      instruccion:
        "El PDF ya está disponible en el chat del usuario. Confirma breve por voz. No leas el contenido completo del PDF.",
    })
  } catch (error) {
    console.warn("[Isi] generate_report_pdf API error", error)
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo generar el PDF",
    })
  }
}

export const handleRealtimeToolEvent = async (
  channel: RTCDataChannel,
  event: RealtimeEvent,
  seenCallIds: Set<string>,
  handlers?: RealtimeToolHandlers,
) => {
  const calls: Array<{ callId: string; name: string; args: string }> = []

  if (event.type === "response.function_call_arguments.done" && event.call_id && event.name) {
    calls.push({
      callId: event.call_id,
      name: event.name,
      args: event.arguments ?? "{}",
    })
  }

  if (event.type === "response.done") {
    for (const item of event.response?.output ?? []) {
      if (item.type === "function_call" && item.call_id && item.name) {
        calls.push({
          callId: item.call_id,
          name: item.name,
          args: item.arguments ?? "{}",
        })
      }
    }
  }

  if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
    const item = event.item
    if (item.call_id && item.name) {
      calls.push({
        callId: item.call_id,
        name: item.name,
        args: item.arguments ?? "{}",
      })
    }
  }

  for (const call of calls) {
    if (seenCallIds.has(call.callId)) {
      continue
    }
    seenCallIds.add(call.callId)
    handlers?.onToolStart?.(call.name)
    try {
      if (call.name === "create_task") {
        await runCreateTask(channel, call.callId, call.args)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "list_tasks") {
        const result = await runListTasks(channel, call.callId, call.args)
        publishStructuredChat(call.name, result, handlers)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "update_task") {
        await runUpdateTask(channel, call.callId, call.args)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "delete_task") {
        await runDeleteTask(channel, call.callId, call.args)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "query_prestamo") {
        const result = await runQueryPrestamo(channel, call.callId, call.args)
        publishStructuredChat(call.name, result, handlers)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "generate_report_pdf") {
        await runGenerateReportPdf(channel, call.callId, call.args, handlers)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "end_call") {
        if (handlers?.shouldEndCall && !handlers.shouldEndCall()) {
          sendToolResult(channel, call.callId, {
            ok: false,
            message: "No cuelgues: el usuario no se despidió.",
          })
          handlers.onAwaitingResponse?.()
        } else {
          sendToolResult(channel, call.callId, { ok: true })
          window.setTimeout(() => handlers?.onHangUp?.(), 800)
        }
      }
    } finally {
      handlers?.onToolEnd?.(call.name)
    }
  }
}
