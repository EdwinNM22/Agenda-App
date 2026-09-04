/**
 * Política: el frontend solo pinta Markdown cuando hay un **listado de registros**
 * (filas tabulares). Resúmenes / KPIs / objetos escalares → null y habla Isi en el chat.
 *
 * - list_tasks con ≥1 tarea → tabla/lista
 * - query_prestamo de recursos de lista (cuotas, pagos, …) con ≥1 fila → tabla
 * - caja-chica, liquidez, resumen, etc. → null (respuesta de Isi)
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
  pagos: { title: "Pagos", keys: ["pagos", "data", "items"] },
  ingresos: { title: "Ingresos", keys: ["ingresos", "data", "items"] },
  egresos: { title: "Egresos", keys: ["egresos", "data", "items"] },
  desembolsos: { title: "Desembolsos", keys: ["desembolsos", "creditos", "data", "items"] },
  creditos: { title: "Créditos", keys: ["creditos", "data", "items"] },
  clientes: { title: "Clientes", keys: ["clientes", "data", "items"] },
}

/** Resúmenes / KPIs: no pintar Markdown; que Isi narre y salga en el chat. */
const PRESTAMO_SUMMARY_RESOURCES = new Set([
  "caja-chica",
  "caja-chica-detalle",
  "liquidez",
  "resumen",
])

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
  const rows = findListRows(data, config.keys)
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
  return null
}
