import {
  createTask,
  deleteTask,
  listTasks,
  parseTaskStatus,
  toNaiveDateTime,
  updateTask,
} from "@/lib/tasks"
import { notifyTasksChanged } from "@/lib/taskEvents"

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

const parseDueAt = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }
  return toNaiveDateTime(value)
}

const parseTaskArgs = (
  raw: string,
): { title: string; description: string; dueAt: string | null } | null => {
  try {
    const parsed = JSON.parse(raw) as CreateTaskArgs
    const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
    const description = typeof parsed.description === "string" ? parsed.description.trim() : ""
    if (!title) {
      return null
    }
    return {
      title,
      description,
      dueAt: parseDueAt(parsed.due_at ?? parsed.dueAt),
    }
  } catch {
    return null
  }
}

const runCreateTask = async (channel: RTCDataChannel, callId: string, rawArgs: string) => {
  const args = parseTaskArgs(rawArgs)
  if (!args) {
    sendToolResult(channel, callId, {
      ok: false,
      message: "Faltó el título de la tarea",
    })
    return
  }

  try {
    const { task } = await createTask(args.title, args.description, args.dueAt)
    notifyTasksChanged()
    sendToolResult(channel, callId, {
      ok: true,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
    })
  } catch (error) {
    sendToolResult(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo crear la tarea",
    })
  }
}

const parseListDate = (raw: string): string | undefined => {
  try {
    const parsed = JSON.parse(raw) as { date?: unknown }
    if (typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date.trim())) {
      return parsed.date.trim()
    }
  } catch {
    // sin fecha: listar todas
  }
  return undefined
}

const runListTasks = async (channel: RTCDataChannel, callId: string, rawArgs: string) => {
  const date = parseListDate(rawArgs)
  try {
    const { tasks } = await listTasks(date)
    sendToolResult(channel, callId, {
      ok: true,
      tasks: tasks.slice(0, 30).map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        dueAt: task.dueAt,
        status: task.status,
      })),
    })
  } catch (error) {
    sendToolResult(channel, callId, {
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

const runUpdateTask = async (channel: RTCDataChannel, callId: string, rawArgs: string) => {
  let parsed: {
    task_id?: unknown
    id?: unknown
    title?: unknown
    description?: unknown
    due_at?: unknown
    dueAt?: unknown
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
      status?: unknown
    }
  } catch {
    sendToolResult(channel, callId, { ok: false, message: "No se pudieron leer los datos" })
    return
  }

  const id = parseTaskId(parsed.task_id ?? parsed.id)
  if (!id) {
    sendToolResult(channel, callId, {
      ok: false,
      message: "Faltó el id de la tarea. Llama list_tasks primero.",
    })
    return
  }

  try {
    const existing = await findTaskById(id)
    if (!existing) {
      sendToolResult(channel, callId, { ok: false, message: "Tarea no encontrada" })
      return
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
      sendToolResult(channel, callId, {
        ok: false,
        message: "La fecha y hora no son válidas",
      })
      return
    }

    const status = parsed.status !== undefined ? parseTaskStatus(parsed.status) : existing.status
    if (parsed.status !== undefined && !status) {
      sendToolResult(channel, callId, {
        ok: false,
        message: "El estado debe ser pendiente, completada, cancelada o archivada",
      })
      return
    }

    const { task } = await updateTask(id, {
      title,
      description,
      dueAt,
      status: status ?? existing.status,
    })
    notifyTasksChanged()
    sendToolResult(channel, callId, {
      ok: true,
      id: task.id,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
      status: task.status,
    })
  } catch (error) {
    sendToolResult(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar la tarea",
    })
  }
}

const runDeleteTask = async (channel: RTCDataChannel, callId: string, rawArgs: string) => {
  let parsed: { task_id?: unknown; id?: unknown }
  try {
    parsed = JSON.parse(rawArgs) as { task_id?: unknown; id?: unknown }
  } catch {
    sendToolResult(channel, callId, { ok: false, message: "No se pudieron leer los datos" })
    return
  }

  const id = parseTaskId(parsed.task_id ?? parsed.id)
  if (!id) {
    sendToolResult(channel, callId, {
      ok: false,
      message: "Faltó el id de la tarea. Llama list_tasks primero.",
    })
    return
  }

  try {
    const existing = await findTaskById(id)
    if (!existing) {
      sendToolResult(channel, callId, { ok: false, message: "Tarea no encontrada" })
      return
    }

    await deleteTask(id)
    notifyTasksChanged()
    sendToolResult(channel, callId, {
      ok: true,
      id,
      title: existing.title,
    })
  } catch (error) {
    sendToolResult(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo eliminar la tarea",
    })
  }
}

type RealtimeToolHandlers = {
  onHangUp?: () => void
  onToolStart?: () => void
  onToolEnd?: () => void
  onAwaitingResponse?: () => void
  shouldEndCall?: () => boolean
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
    handlers?.onToolStart?.()
    try {
      if (call.name === "create_task") {
        await runCreateTask(channel, call.callId, call.args)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "list_tasks") {
        await runListTasks(channel, call.callId, call.args)
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
      handlers?.onToolEnd?.()
    }
  }
}
