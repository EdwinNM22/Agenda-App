const MAX_ROWS = 25
const MAX_LIST = 12

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

const pickColumns = (
  rows: Array<Record<string, unknown>>,
  preferred: Array<{ key: string; label: string }>,
): Array<{ key: string; label: string }> => {
  const present = preferred.filter((column) => rows.some((row) => row[column.key] !== undefined))
  if (present.length > 0) {
    return present.slice(0, 6)
  }
  const keys = Object.keys(rows[0] ?? {}).filter((key) => !key.startsWith("_")).slice(0, 5)
  return keys.map((key) => ({ key, label: key }))
}

const formatRows = (
  title: string,
  rows: Array<Record<string, unknown>>,
  preferred: Array<{ key: string; label: string }>,
): string | null => {
  if (rows.length === 0) {
    return `## ${title}\n\nSin resultados.`
  }

  const limited = rows.slice(0, MAX_ROWS)
  const columns = pickColumns(limited, preferred)

  if (limited.length === 1 && columns.length <= 4) {
    const row = limited[0]
    const lines = columns.map((column) => `- **${column.label}:** ${cell(row[column.key])}`)
    return `## ${title}\n\n${lines.join("\n")}`
  }

  const table = markdownTable(columns, limited)
  const extra =
    rows.length > MAX_ROWS ? `\n\n_Mostrando ${MAX_ROWS} de ${rows.length}._` : ""
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
    title: task.title,
    dueAt: task.dueAt,
    statusLabel: task.statusLabel ?? task.status,
  }))
  return formatRows("Tareas", rows, TASK_COLUMNS)
}

const PRESTAMO_LIST_KEYS: Record<string, { title: string; keys: string[] }> = {
  cuotas: { title: "Cuotas", keys: ["cuotas", "data", "items"] },
  "cuotas-vencidas": { title: "Cuotas vencidas", keys: ["cuotas", "cuotasVencidas", "data", "items"] },
  pagos: { title: "Pagos", keys: ["pagos", "data", "items"] },
  ingresos: { title: "Ingresos", keys: ["ingresos", "data", "items"] },
  egresos: { title: "Egresos", keys: ["egresos", "data", "items"] },
  desembolsos: { title: "Desembolsos", keys: ["desembolsos", "creditos", "data", "items"] },
  creditos: { title: "Créditos", keys: ["creditos", "data", "items"] },
  clientes: { title: "Clientes", keys: ["clientes", "data", "items"] },
}

const PRESTAMO_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "clienteNombre", label: "Cliente" },
  { key: "nombre", label: "Nombre" },
  { key: "usuario", label: "Cliente" },
  { key: "cliente", label: "Cliente" },
  { key: "monto", label: "Monto" },
  { key: "montoDesembolsar", label: "Monto" },
  { key: "cuota", label: "Cuota" },
  { key: "cuotaMensual", label: "Cuota" },
  { key: "saldo", label: "Saldo" },
  { key: "totalPendiente", label: "Pendiente" },
  { key: "estado", label: "Estado" },
  { key: "fecha", label: "Fecha" },
  { key: "fechaVencimiento", label: "Vence" },
  { key: "fechaDesembolsado", label: "Desembolso" },
  { key: "motivo", label: "Motivo" },
  { key: "tipo", label: "Tipo" },
  { key: "dui", label: "DUI" },
  { key: "telefono", label: "Teléfono" },
]

const findFirstArray = (
  data: Record<string, unknown>,
  keys: string[],
): Array<Record<string, unknown>> => {
  for (const key of keys) {
    const rows = asObjectRows(data[key])
    if (rows.length > 0) {
      return rows
    }
  }
  for (const value of Object.values(data)) {
    const rows = asObjectRows(value)
    if (rows.length >= 2) {
      return rows
    }
  }
  return []
}

const formatScalarObject = (title: string, data: Record<string, unknown>): string | null => {
  const skip = new Set([
    "ok",
    "instruccion",
    "periodoConsultado",
    "resource",
    "message",
    "cuotas",
    "pagos",
    "ingresos",
    "egresos",
    "clientes",
    "creditos",
    "desembolsos",
  ])
  const entries = Object.entries(data).filter(([key, value]) => {
    if (skip.has(key) || key.startsWith("_")) {
      return false
    }
    if (value === null || value === undefined) {
      return false
    }
    if (typeof value === "object") {
      return false
    }
    return true
  })

  if (entries.length === 0) {
    return null
  }

  const lines = entries
    .slice(0, MAX_LIST)
    .map(([key, value]) => `- **${key}:** ${cell(value)}`)
  return `## ${title}\n\n${lines.join("\n")}`
}

const formatQueryPrestamo = (output: Record<string, unknown>): string | null => {
  if (output.ok === false) {
    return null
  }

  const resource = typeof output.resource === "string" ? output.resource : ""
  const data = asRecord(output.data) ?? output
  const config = PRESTAMO_LIST_KEYS[resource]
  const title = config?.title ?? (resource ? resource.replace(/-/g, " ") : "Atlas")
  const rows = findFirstArray(data, config?.keys ?? ["data", "items"])

  if (rows.length > 0) {
    return formatRows(title.charAt(0).toUpperCase() + title.slice(1), rows, PRESTAMO_COLUMNS)
  }

  return formatScalarObject(title.charAt(0).toUpperCase() + title.slice(1), data)
}

/** Convierte el resultado de una tool a Markdown para el panel de chat. Null = no mostrar tarjeta. */
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
  return null
}
