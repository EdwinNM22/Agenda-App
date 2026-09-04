export type ReportMetadataItem = {
  label: string
  value: string
}

export type ReportStatusTone = "ok" | "warn" | "danger" | "neutral"

export type ReportHeadingComponent = {
  type: "heading"
  text: string
  level?: 1 | 2 | 3
}

export type ReportTextComponent = {
  type: "text"
  text: string
}

export type ReportNoteComponent = {
  type: "note"
  text: string
}

export type ReportMetricItem = {
  label: string
  value: string
  hint?: string
}

export type ReportMetricsComponent = {
  type: "metrics"
  items: ReportMetricItem[]
}

export type ReportTableColumn = {
  key: string
  label: string
  align?: "left" | "right" | "center"
  width?: number
}

export type ReportTableComponent = {
  type: "table"
  columns: ReportTableColumn[]
  rows: Array<Record<string, string | number | null | undefined>>
}

export type ReportListComponent = {
  type: "list"
  style?: "bullet" | "numbered"
  items: string[]
}

export type ReportKeyValueComponent = {
  type: "keyValue"
  title?: string
  pairs: Array<{ label: string; value: string }>
}

export type ReportStatusComponent = {
  type: "status"
  label: string
  value: string
  tone?: ReportStatusTone
}

export type ReportTotalsComponent = {
  type: "totals"
  rows: Array<{ label: string; value: string }>
}

export type ReportSpacerComponent = {
  type: "spacer"
  size?: "sm" | "md" | "lg"
}

export type ReportDividerComponent = {
  type: "divider"
}

export type ReportComponent =
  | ReportHeadingComponent
  | ReportTextComponent
  | ReportNoteComponent
  | ReportMetricsComponent
  | ReportTableComponent
  | ReportListComponent
  | ReportKeyValueComponent
  | ReportStatusComponent
  | ReportTotalsComponent
  | ReportSpacerComponent
  | ReportDividerComponent

export type ReportSection = {
  title?: string
  components: ReportComponent[]
}

export type Report = {
  title: string
  subtitle?: string
  metadata?: ReportMetadataItem[]
  sections: ReportSection[]
}

export type GenerateReportBody = {
  report?: unknown
  fileName?: unknown
}

const MAX_SECTIONS = 50
const MAX_TABLE_ROWS = 200
const MAX_LIST_ITEMS = 200
const MAX_METRICS = 12
const MAX_STRING = 4_000
const MAX_TITLE = 200
const MAX_PAYLOAD_CHARS = 500_000

const asTrimmedString = (value: unknown, max = MAX_STRING): string | null => {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.slice(0, max)
}

const asOptionalString = (value: unknown, max = MAX_STRING): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined
  }
  return asTrimmedString(value, max) ?? undefined
}

const cellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ""
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === "boolean") {
    return value ? "Sí" : "No"
  }
  if (typeof value === "string") {
    return value.trim().slice(0, 500)
  }
  return String(value).slice(0, 500)
}

const parseComponent = (raw: unknown): ReportComponent | null => {
  if (!raw || typeof raw !== "object") {
    return null
  }
  const source = raw as Record<string, unknown>
  const type = asTrimmedString(source.type, 40)
  if (!type) {
    return null
  }

  switch (type) {
    case "heading": {
      const text = asTrimmedString(source.text, 300)
      if (!text) {
        return null
      }
      const levelRaw = source.level
      const level =
        levelRaw === 1 || levelRaw === 2 || levelRaw === 3
          ? levelRaw
          : levelRaw === "1" || levelRaw === "2" || levelRaw === "3"
            ? (Number(levelRaw) as 1 | 2 | 3)
            : 2
      return { type: "heading", text, level }
    }
    case "text": {
      const text = asTrimmedString(source.text)
      return text ? { type: "text", text } : null
    }
    case "note": {
      const text = asTrimmedString(source.text)
      return text ? { type: "note", text } : null
    }
    case "metrics": {
      if (!Array.isArray(source.items)) {
        return null
      }
      const items: ReportMetricItem[] = []
      for (const item of source.items.slice(0, MAX_METRICS)) {
        if (!item || typeof item !== "object") {
          continue
        }
        const row = item as Record<string, unknown>
        const label = asTrimmedString(row.label, 80)
        const value = asTrimmedString(row.value, 120)
        if (!label || !value) {
          continue
        }
        items.push({
          label,
          value,
          hint: asOptionalString(row.hint, 120),
        })
      }
      return items.length > 0 ? { type: "metrics", items } : null
    }
    case "table": {
      if (!Array.isArray(source.columns) || !Array.isArray(source.rows)) {
        return null
      }
      const columns: ReportTableColumn[] = []
      for (const col of source.columns.slice(0, 12)) {
        if (!col || typeof col !== "object") {
          continue
        }
        const row = col as Record<string, unknown>
        const key = asTrimmedString(row.key, 60)
        const label = asTrimmedString(row.label, 80) ?? key
        if (!key || !label) {
          continue
        }
        const align =
          row.align === "left" || row.align === "right" || row.align === "center"
            ? row.align
            : "left"
        const width =
          typeof row.width === "number" && Number.isFinite(row.width) && row.width > 0
            ? Math.min(row.width, 400)
            : undefined
        columns.push({ key, label, align, width })
      }
      if (columns.length === 0) {
        return null
      }
      const rows: Array<Record<string, string>> = []
      for (const row of source.rows.slice(0, MAX_TABLE_ROWS)) {
        if (!row || typeof row !== "object") {
          continue
        }
        const sourceRow = row as Record<string, unknown>
        const normalized: Record<string, string> = {}
        for (const column of columns) {
          normalized[column.key] = cellValue(sourceRow[column.key])
        }
        rows.push(normalized)
      }
      return { type: "table", columns, rows }
    }
    case "list": {
      if (!Array.isArray(source.items)) {
        return null
      }
      const items = source.items
        .map((item) => asTrimmedString(item, 500))
        .filter((item): item is string => Boolean(item))
        .slice(0, MAX_LIST_ITEMS)
      if (items.length === 0) {
        return null
      }
      const style = source.style === "numbered" ? "numbered" : "bullet"
      return { type: "list", style, items }
    }
    case "keyValue": {
      if (!Array.isArray(source.pairs)) {
        return null
      }
      const pairs: Array<{ label: string; value: string }> = []
      for (const pair of source.pairs.slice(0, 40)) {
        if (!pair || typeof pair !== "object") {
          continue
        }
        const row = pair as Record<string, unknown>
        const label = asTrimmedString(row.label, 80)
        const value = asTrimmedString(row.value, 500)
        if (!label || value === null) {
          continue
        }
        pairs.push({ label, value: value || "—" })
      }
      if (pairs.length === 0) {
        return null
      }
      return {
        type: "keyValue",
        title: asOptionalString(source.title, 120),
        pairs,
      }
    }
    case "status": {
      const label = asTrimmedString(source.label, 80)
      const value = asTrimmedString(source.value, 120)
      if (!label || !value) {
        return null
      }
      const toneRaw = asOptionalString(source.tone, 20)
      const tone: ReportStatusTone =
        toneRaw === "ok" || toneRaw === "warn" || toneRaw === "danger" || toneRaw === "neutral"
          ? toneRaw
          : "neutral"
      return { type: "status", label, value, tone }
    }
    case "totals": {
      if (!Array.isArray(source.rows)) {
        return null
      }
      const rows: Array<{ label: string; value: string }> = []
      for (const row of source.rows.slice(0, 30)) {
        if (!row || typeof row !== "object") {
          continue
        }
        const item = row as Record<string, unknown>
        const label = asTrimmedString(item.label, 120)
        const value = asTrimmedString(item.value, 120)
        if (!label || !value) {
          continue
        }
        rows.push({ label, value })
      }
      return rows.length > 0 ? { type: "totals", rows } : null
    }
    case "spacer": {
      const size =
        source.size === "sm" || source.size === "md" || source.size === "lg" ? source.size : "md"
      return { type: "spacer", size }
    }
    case "divider":
      return { type: "divider" }
    default:
      return null
  }
}

export const parseReport = (raw: unknown): { report: Report } | { error: string } => {
  if (raw === undefined || raw === null) {
    return { error: "Falta el reporte" }
  }

  let serialized = ""
  try {
    serialized = JSON.stringify(raw)
  } catch {
    return { error: "El reporte no es JSON válido" }
  }
  if (serialized.length > MAX_PAYLOAD_CHARS) {
    return { error: "El reporte es demasiado grande" }
  }

  if (!raw || typeof raw !== "object") {
    return { error: "El reporte debe ser un objeto" }
  }

  const source = raw as Record<string, unknown>
  const title = asTrimmedString(source.title, MAX_TITLE)
  if (!title) {
    return { error: "El reporte necesita un título" }
  }

  if (!Array.isArray(source.sections) || source.sections.length === 0) {
    return { error: "El reporte necesita al menos una sección" }
  }

  const metadata: ReportMetadataItem[] = []
  if (Array.isArray(source.metadata)) {
    for (const item of source.metadata.slice(0, 12)) {
      if (!item || typeof item !== "object") {
        continue
      }
      const row = item as Record<string, unknown>
      const label = asTrimmedString(row.label, 60)
      const value = asTrimmedString(row.value, 200)
      if (label && value) {
        metadata.push({ label, value })
      }
    }
  }

  const sections: ReportSection[] = []
  for (const sectionRaw of source.sections.slice(0, MAX_SECTIONS)) {
    if (!sectionRaw || typeof sectionRaw !== "object") {
      continue
    }
    const section = sectionRaw as Record<string, unknown>
    if (!Array.isArray(section.components)) {
      continue
    }
    const components = section.components
      .map(parseComponent)
      .filter((component): component is ReportComponent => Boolean(component))
    if (components.length === 0) {
      continue
    }
    sections.push({
      title: asOptionalString(section.title, 160),
      components,
    })
  }

  if (sections.length === 0) {
    return { error: "El reporte no tiene secciones con componentes válidos" }
  }

  return {
    report: {
      title,
      subtitle: asOptionalString(source.subtitle, 300),
      metadata: metadata.length > 0 ? metadata : undefined,
      sections,
    },
  }
}

export const sanitizeFileName = (raw: unknown, fallbackTitle: string): string => {
  const base =
    (typeof raw === "string" && raw.trim()
      ? raw.trim()
      : fallbackTitle
    )
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "reporte"

  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`
}
