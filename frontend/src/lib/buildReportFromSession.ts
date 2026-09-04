import type { SessionToolSnapshot } from "@/lib/sessionToolData"
import { getLatestSessionToolData, getSessionToolSnapshots } from "@/lib/sessionToolData"

type ReportColumn = { key: string; label: string }
type ReportRow = Record<string, string | number | null | undefined>

type Report = {
  title: string
  subtitle?: string
  metadata?: Array<{ label: string; value: string }>
  sections: Array<{
    title?: string
    components: Array<Record<string, unknown>>
  }>
}

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
  return String(value).trim() || "—"
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const asObjectRows = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
}

const pickColumns = (rows: Array<Record<string, unknown>>, preferred: ReportColumn[]): ReportColumn[] =>
  preferred.filter((column) => rows.some((row) => row[column.key] !== undefined)).slice(0, 8)

const tableComponent = (columns: ReportColumn[], rows: Array<Record<string, unknown>>) => ({
  type: "table" as const,
  columns,
  rows: rows.slice(0, 200).map((row) => {
    const out: ReportRow = {}
    for (const column of columns) {
      out[column.key] = cell(row[column.key])
    }
    return out
  }),
})

const TASK_COLUMNS: ReportColumn[] = [
  { key: "title", label: "Tarea" },
  { key: "dueAt", label: "Fecha" },
  { key: "statusLabel", label: "Estado" },
]

const PRESTAMO_COLUMNS: ReportColumn[] = [
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
]

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

const findListRows = (data: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const rows = asObjectRows(data[key])
    if (rows.length > 0) {
      return rows
    }
  }
  return []
}

const periodMeta = (output: Record<string, unknown>) => {
  const periodo = asRecord(output.periodoConsultado)
  const meta: Array<{ label: string; value: string }> = []
  if (typeof periodo?.fechaInicio === "string" && periodo.fechaInicio) {
    meta.push({
      label: "Período",
      value:
        periodo.fechaFin && periodo.fechaFin !== periodo.fechaInicio
          ? `${periodo.fechaInicio} → ${periodo.fechaFin}`
          : periodo.fechaInicio,
    })
  }
  return meta
}

const buildFromTasks = (output: Record<string, unknown>, title: string): Report | null => {
  const rows: Array<Record<string, unknown>> = asObjectRows(output.tasks).map((task) => ({
    ...task,
    statusLabel: task.statusLabel ?? task.status,
  }))
  const columns = pickColumns(rows, TASK_COLUMNS)
  if (columns.length === 0) {
    return null
  }
  const pending = rows.filter((row) => {
    const status = row.status
    const label = row.statusLabel
    return status === "pending" || label === "Pendiente"
  }).length
  return {
    title,
    metadata: [{ label: "Fecha", value: new Date().toLocaleDateString("es") }],
    sections: [
      {
        title: "Resumen",
        components: [
          {
            type: "metrics",
            items: [
              { label: "Total", value: String(rows.length) },
              { label: "Pendientes", value: String(pending) },
            ],
          },
        ],
      },
      {
        title: "Tareas",
        components: rows.length > 0 ? [tableComponent(columns, rows)] : [{ type: "note", text: "Sin tareas." }],
      },
    ],
  }
}

const buildFromPrestamo = (output: Record<string, unknown>, title: string): Report | null => {
  const resource = typeof output.resource === "string" ? output.resource : ""
  const data = asRecord(output.data) ?? output
  const config = PRESTAMO_LIST_KEYS[resource]
  const sectionTitle = config?.title ?? "Resultados"
  const rows = config ? findListRows(data, config.keys) : []
  const columns = pickColumns(rows, PRESTAMO_COLUMNS)
  const metadata = periodMeta(output)

  if (rows.length > 0 && columns.length > 0) {
    const totalMonto = rows.reduce((sum, row) => {
      const raw = row.monto ?? row.montoDesembolsar ?? row.cuota ?? row.cuotaMensual
      const amount = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""))
      return Number.isFinite(amount) ? sum + amount : sum
    }, 0)

    return {
      title,
      metadata: metadata.length > 0 ? metadata : undefined,
      sections: [
        {
          title: "Resumen",
          components: [
            {
              type: "metrics",
              items: [
                { label: "Registros", value: String(rows.length) },
                ...(totalMonto > 0
                  ? [{ label: "Total", value: totalMonto.toLocaleString("es", { maximumFractionDigits: 2 }) }]
                  : []),
              ],
            },
          ],
        },
        {
          title: sectionTitle,
          components: [tableComponent(columns, rows)],
        },
      ],
    }
  }

  // Resumen / KPIs: pares clave-valor legibles (sin volcar todo el JSON)
  const skip = new Set(["ok", "instruccion", "periodoConsultado", "resource", "message"])
  const pairs = Object.entries(data)
    .filter(([key, value]) => !skip.has(key) && value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 20)
    .map(([key, value]) => ({ label: key, value: cell(value) }))

  if (pairs.length === 0) {
    return null
  }

  return {
    title,
    metadata: metadata.length > 0 ? metadata : undefined,
    sections: [
      {
        title: sectionTitle,
        components: [{ type: "keyValue", pairs }],
      },
    ],
  }
}

const buildFromSnapshot = (snapshot: SessionToolSnapshot, title: string): Report | null => {
  if (snapshot.tool === "list_tasks") {
    return buildFromTasks(snapshot.output, title)
  }
  return buildFromPrestamo(snapshot.output, title)
}

const defaultTitleFor = (snapshot: SessionToolSnapshot): string => {
  if (snapshot.tool === "list_tasks") {
    return "Reporte de tareas"
  }
  const resource = typeof snapshot.output.resource === "string" ? snapshot.output.resource : "Atlas"
  const config = PRESTAMO_LIST_KEYS[resource]
  return config ? `Reporte de ${config.title.toLowerCase()}` : "Reporte Atlas"
}

/** Arma un Report desde los datos cacheados de la sesión (sin que el modelo reenvíe filas). */
export const buildReportFromSession = (options?: {
  title?: string
  subtitle?: string
  source?: "last" | "tasks" | "prestamo" | "all"
}): { report: Report } | { error: string } => {
  const source = options?.source ?? "last"
  const title = options?.title?.trim()
  const subtitle = options?.subtitle?.trim()

  if (source === "all") {
    const all = getSessionToolSnapshots()
    if (all.length === 0) {
      return { error: "No hay datos de consultas en esta sesión para armar el PDF" }
    }
    const sections: Report["sections"] = []
    for (const snapshot of all) {
      const built = buildFromSnapshot(snapshot, defaultTitleFor(snapshot))
      if (!built) {
        continue
      }
      for (const section of built.sections) {
        sections.push({
          title: section.title ?? defaultTitleFor(snapshot),
          components: section.components,
        })
      }
    }
    if (sections.length === 0) {
      return { error: "Los datos de la sesión no se pudieron convertir a reporte" }
    }
    return {
      report: {
        title: title || "Reporte de la sesión",
        subtitle,
        metadata: [{ label: "Fecha", value: new Date().toLocaleDateString("es") }],
        sections,
      },
    }
  }

  const tool =
    source === "tasks" ? "list_tasks" : source === "prestamo" ? "query_prestamo" : undefined
  const snapshot = getLatestSessionToolData(tool)
  if (!snapshot) {
    return {
      error:
        "No hay resultados recientes para generar el PDF. Consulta primero los datos (tareas o Atlas) y luego pide el reporte.",
    }
  }

  const built = buildFromSnapshot(snapshot, title || defaultTitleFor(snapshot))
  if (!built) {
    return { error: "No se pudo armar el reporte con los datos disponibles" }
  }
  if (subtitle) {
    built.subtitle = subtitle
  }
  return { report: built }
}
