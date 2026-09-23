/**
 * Política: el frontend solo pinta Markdown cuando hay un **listado de registros**
 * (filas tabulares). Resúmenes / KPIs / objetos escalares → null y habla Isi en el chat.
 *
 * - list_tasks con ≥1 tarea → tabla/lista
 * - query_prestamo de recursos de lista (cuotas, pagos, …) con ≥1 fila → tabla
 * - caja-chica, resumen, etc. → null (respuesta de Isi)
 * - sin filas o sin columnas conocidas → null
 */

const MAX_ROWS = 25

const cell = (value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    return "—"
  }
  if (typeof value === "boolean") {
    return value ? "Sí" : "No"
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : value.toLocaleString("es", { maximumFractionDigits: 2 })
  }
  return String(value).replace(/\|/g, "/").replace(/\r?\n/g, " ").trim() || "—"
}

const markdownTable = (
  columns: Array<{ key: string; label: string }>,
  rows: Array<Record<string, unknown>>,
): string => {
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`
  const separator = `| ${columns.map(() => "---").join(" | ")} |`
  const body = rows
    .map((row) => `| ${columns.map((column) => cell(row[column.key])).join(" | ")} |`)
    .join("\n")
  return `${header}\n${separator}\n${body}`
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const asObjectRows = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
}

/** Solo columnas con etiqueta humana conocida; nunca claves crudas del API. */
const pickColumns = (
  rows: Array<Record<string, unknown>>,
  preferred: Array<{ key: string; label: string }>,
): Array<{ key: string; label: string }> =>
  preferred.filter((column) => rows.some((row) => row[column.key] !== undefined)).slice(0, 6)

const formatRows = (
  title: string,
  rows: Array<Record<string, unknown>>,
  preferred: Array<{ key: string; label: string }>,
): string | null => {
  if (rows.length === 0) {
    return null
  }

  const limited = rows.slice(0, MAX_ROWS)
  const columns = pickColumns(limited, preferred)
  if (columns.length === 0) {
    return null
  }

  if (limited.length === 1) {
    const row = limited[0]
    const lines = columns.map((column) => `- **${column.label}:** ${cell(row[column.key])}`)
    return `## ${title}\n\n${lines.join("\n")}`
  }

  const table = markdownTable(columns, limited)
  const extra = rows.length > MAX_ROWS ? `\n\n_Mostrando ${MAX_ROWS} de ${rows.length}._` : ""
  return `## ${title}\n\n${table}${extra}`
}

const TASK_COLUMNS = [
  { key: "title", label: "Tarea" },
  { key: "dueAt", label: "Fecha" },
  { key: "statusLabel", label: "Estado" },
]

const formatListTasks = (output: Record<string, unknown>): string | null => {
  if (output.ok !== true) {
    return null
  }
  const rows = asObjectRows(output.tasks).map((task) => ({
    ...task,
    statusLabel: task.statusLabel ?? task.status,
  }))
  return formatRows("Tareas", rows, TASK_COLUMNS)
}

/** Recursos que son listados de filas → candidatos a tabla en el chat. */
const PRESTAMO_LIST_RESOURCES: Record<string, { title: string; keys: string[] }> = {
  cuotas: { title: "Cuotas", keys: ["cuotas", "data", "items"] },
  "cuotas-vencidas": { title: "Cuotas vencidas", keys: ["cuotas", "cuotasVencidas", "data", "items"] },
  pagos: { title: "Pagos", keys: ["cuotasPagadas", "abonos", "pagos", "data", "items"] },
  ingresos: { title: "Ingresos", keys: ["ingresos", "data", "items"] },
  egresos: { title: "Egresos", keys: ["egresos", "data", "items"] },
  desembolsos: { title: "Desembolsos", keys: ["desembolsos", "creditos", "data", "items"] },
  creditos: { title: "Créditos", keys: ["creditos", "data", "items"] },
  clientes: { title: "Clientes", keys: ["clientes", "data", "items"] },
  movimientos: { title: "Movimientos", keys: ["movimientos", "data", "items"] },
}

/** Resúmenes / KPIs: no pintar Markdown; que Isi narre y salga en el chat. */
const PRESTAMO_SUMMARY_RESOURCES = new Set(["caja-chica", "caja-chica-detalle"])

const PRESTAMO_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "clienteNombre", label: "Cliente" },
  { key: "nombre", label: "Nombre" },
  { key: "usuario", label: "Cliente" },
  { key: "cliente", label: "Cliente" },
  { key: "codigo", label: "Código" },
  { key: "tipoMovimiento", label: "Tipo" },
  { key: "monto", label: "Monto" },
  { key: "montoDesembolsar", label: "Monto" },
  { key: "total", label: "Total" },
  { key: "mora", label: "Mora" },
  { key: "cuota", label: "Cuota" },
  { key: "cuotaMensual", label: "Cuota" },
  { key: "saldo", label: "Saldo" },
  { key: "totalPendiente", label: "Pendiente" },
  { key: "estado", label: "Estado" },
  { key: "fecha", label: "Fecha" },
  { key: "fechaPagado", label: "Pagado" },
  { key: "fechaVencimiento", label: "Vence" },
  { key: "fechaDesembolsado", label: "Desembolso" },
  { key: "motivo", label: "Motivo" },
  { key: "ingresoTipoLabel", label: "Tipo" },
  { key: "destinoLabel", label: "Destino" },
  { key: "registradoPor", label: "Registró" },
  { key: "tipo", label: "Tipo" },
  { key: "creditoTipo", label: "Crédito" },
  { key: "dui", label: "DUI" },
  { key: "telefono", label: "Teléfono" },
]

const findListRows = (
  data: Record<string, unknown>,
  keys: string[],
): Array<Record<string, unknown>> => {
  for (const key of keys) {
    const rows = asObjectRows(data[key])
    if (rows.length > 0) {
      return rows
    }
  }
  return []
}

/** Pagos: une cuotas pagadas + abonos para una sola tabla en chat. */
const findPagosRows = (data: Record<string, unknown>): Array<Record<string, unknown>> => {
  const cuotas = asObjectRows(data.cuotasPagadas)
  const abonos = asObjectRows(data.abonos)
  if (cuotas.length === 0 && abonos.length === 0) {
    return findListRows(data, ["pagos", "data", "items"])
  }
  return [...cuotas, ...abonos]
}

const BIOVIZION_LIST_RESOURCES: Record<string, { title: string; keys: string[] }> = {
  proyectos: { title: "Proyectos", keys: ["projects", "highlights.projects"] },
  reportes: { title: "Reportes", keys: ["reports", "highlights.reports"] },
  citas: { title: "Citas", keys: ["appointments", "highlights.appointments"] },
  dre: { title: "DRE", keys: ["entries", "highlights.dre"] },
  asistencia: { title: "En proyecto (push in)", keys: ["activeSessions", "highlights.attendance"] },
  personas: { title: "Trabajadores", keys: ["data"] },
  horas: { title: "Horas", keys: ["byDay", "sessions", "data"] },
  equipo: { title: "Equipo", keys: ["data"] },
  "push-pendientes": { title: "Push pendientes", keys: ["pending"] },
  inconsistencias: { title: "Inconsistencias", keys: ["inconsistencies"] },
}

const BIOVIZION_SUMMARY_RESOURCES = new Set(["resumen", "ubicaciones"])

const BIOVIZION_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "title", label: "Proyecto" },
  { key: "projectTitle", label: "Proyecto" },
  { key: "name", label: "Nombre" },
  { key: "userName", label: "Trabajador" },
  { key: "workerName", label: "Trabajador" },
  { key: "clientName", label: "Cliente" },
  { key: "location", label: "Ubicación" },
  { key: "status", label: "Estado" },
  { key: "role", label: "Rol" },
  { key: "date", label: "Día" },
  { key: "totalHours", label: "Horas" },
  { key: "hoursToday", label: "Horas hoy" },
  { key: "pushIn", label: "Push in" },
  { key: "lastPushIn", label: "Push in" },
  { key: "lastPushOut", label: "Push out" },
  { key: "startDateTime", label: "Inicio" },
  { key: "endDateTime", label: "Fin" },
  { key: "visitDate", label: "Visita" },
  { key: "evaluationDate", label: "Evaluación" },
  { key: "phone", label: "Teléfono" },
  { key: "email", label: "Email" },
  { key: "motive", label: "Motivo" },
  { key: "interventionDate", label: "Fecha" },
]

const nestedRows = (data: Record<string, unknown>, dottedKey: string): Array<Record<string, unknown>> => {
  const [head, ...rest] = dottedKey.split(".")
  const next = data[head]
  if (rest.length === 0) {
    return asObjectRows(next)
  }
  if (Array.isArray(next)) {
    return next.flatMap((item) => {
      const record = asRecord(item)
      if (!record) {
        return []
      }
      return nestedRows(record, rest.join("."))
    })
  }
  const record = asRecord(next)
  return record ? nestedRows(record, rest.join(".")) : []
}

const findBiovizionRows = (data: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> => {
  for (const key of keys) {
    if (key.includes(".")) {
      const rows = nestedRows(data, key)
      if (rows.length > 0) {
        return rows
      }
      continue
    }
    const direct = asObjectRows(data[key])
    if (direct.length > 0) {
      return direct
    }
    if (Array.isArray(data)) {
      return asObjectRows(data)
    }
  }
  if (Array.isArray(data)) {
    return asObjectRows(data)
  }
  return []
}

const flattenEquipoRows = (teams: Array<Record<string, unknown>>): Array<Record<string, unknown>> => {
  const rows: Array<Record<string, unknown>> = []
  for (const team of teams) {
    const members = asObjectRows(team.members)
    for (const member of members) {
      rows.push({
        projectTitle: team.projectTitle,
        ...member,
      })
    }
  }
  return rows
}

const formatQueryBiovizion = (output: Record<string, unknown>): string | null => {
  if (output.ok === false) {
    return null
  }

  const resource = typeof output.resource === "string" ? output.resource : ""
  if (!resource || BIOVIZION_SUMMARY_RESOURCES.has(resource)) {
    return null
  }

  const config = BIOVIZION_LIST_RESOURCES[resource]
  if (!config) {
    return null
  }

  if (resource === "horas") {
    const data = asRecord(output.data)
    const byDay = data ? asObjectRows(data.byDay) : []
    if (byDay.length > 0) {
      const table = formatRows("Horas por día", byDay, [
        { key: "date", label: "Día" },
        { key: "totalHours", label: "Horas" },
      ])
      if (!table) {
        return null
      }
      const who =
        typeof data?.userNameFilter === "string" && data.userNameFilter.trim()
          ? data.userNameFilter.trim()
          : null
      const start = cell(data?.fechaInicio)
      const end = cell(data?.fechaFin)
      const total = cell(data?.totalHours)
      const pushLines = asObjectRows(data?.activePushIns).map((row) => {
        const project = cell(row.projectTitle)
        const since = cell(row.pushIn)
        return `- **Push in activo:** ${project} (desde ${since})`
      })
      const context = who
        ? `- **Trabajador:** ${who}\n- **Período:** ${start} → ${end}\n- **Total cerrado:** ${total} h`
        : `- **Período:** ${start} → ${end}\n- **Total cerrado:** ${total} h`
      const pushBlock = pushLines.length > 0 ? `\n${pushLines.join("\n")}` : ""
      return `${context}${pushBlock}\n\n${table}`
    }
  }

  const payload = output.data
  if (Array.isArray(payload)) {
    const rows =
      resource === "equipo" ? flattenEquipoRows(asObjectRows(payload)) : asObjectRows(payload)
    return formatRows(config.title, rows, BIOVIZION_COLUMNS)
  }

  const data = asRecord(payload) ?? asRecord(output) ?? {}
  const rows =
    resource === "equipo" ? flattenEquipoRows(asObjectRows(data)) : findBiovizionRows(data, config.keys)

  return formatRows(config.title, rows, BIOVIZION_COLUMNS)
}

const formatQueryPrestamo = (output: Record<string, unknown>): string | null => {
  if (output.ok === false) {
    return null
  }

  const resource = typeof output.resource === "string" ? output.resource : ""
  if (!resource || PRESTAMO_SUMMARY_RESOURCES.has(resource)) {
    return null
  }

  const config = PRESTAMO_LIST_RESOURCES[resource]
  if (!config) {
    return null
  }

  const data = asRecord(output.data) ?? output
  const rows = resource === "pagos" ? findPagosRows(data) : findListRows(data, config.keys)
  return formatRows(config.title, rows, PRESTAMO_COLUMNS)
}

/** Null = no tarjeta: el chat muestra la respuesta hablada de Isi. */
export const formatToolResultMarkdown = (
  toolName: string,
  output: Record<string, unknown> | undefined,
): string | null => {
  if (!output) {
    return null
  }

  if (toolName === "list_tasks") {
    return formatListTasks(output)
  }
  if (toolName === "query_prestamo") {
    return formatQueryPrestamo(output)
  }
  if (toolName === "query_biovizion") {
    return formatQueryBiovizion(output)
  }
  if (toolName === "query_banco") {
    const resource = typeof output.resource === "string" ? output.resource : ""
    if (resource === "caja-chica") {
      return null
    }
    return formatQueryPrestamo(output)
  }
  return null
}
