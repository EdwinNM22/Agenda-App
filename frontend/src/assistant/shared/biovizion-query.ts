import { formatYmd, normalizePrestamoParams } from "@/assistant/shared/period"

const startOfDay = (date: Date): Date => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const todayAnchor = (): Date => startOfDay(new Date())

/** Recursos Biovizion que por defecto acotan al día si el usuario no dio período. */
export const BIOVIZION_RESOURCES_DEFAULT_TODAY = new Set([
  "resumen",
  "proyectos",
  "reportes",
  "citas",
  "horas",
])

const hasPeriodParams = (params: Record<string, unknown>): boolean =>
  Boolean(
    (typeof params.periodo === "string" && params.periodo.trim()) ||
      (typeof params.fecha === "string" && params.fecha.trim()) ||
      (typeof params.fechaInicio === "string" && params.fechaInicio.trim()) ||
      (typeof params.fechaFin === "string" && params.fechaFin.trim()) ||
      (typeof params.date === "string" && params.date.trim()),
  )

const mapHorasParams = (params: Record<string, unknown>): Record<string, unknown> => {
  const out = { ...params }
  delete out.periodo

  if (typeof out.fecha === "string" && out.fecha.trim() && !out.fechaInicio) {
    out.fechaInicio = out.fecha
    out.fechaFin = out.fecha
    delete out.fecha
  }

  const start = typeof out.fechaInicio === "string" ? out.fechaInicio.trim() : ""
  const end = typeof out.fechaFin === "string" ? out.fechaFin.trim() : ""

  if (start && end && start === end) {
    out.date = start
    delete out.fechaInicio
    delete out.fechaFin
  }

  return out
}

export const applyBiovizionDefaultPeriod = (
  resource: string,
  params: Record<string, unknown> | undefined,
  anchor = todayAnchor(),
): Record<string, unknown> | undefined => {
  const base = { ...(params ?? {}) }

  if (resource === "horas") {
    if (!hasPeriodParams(base)) {
      base.periodo = "hoy"
    }
    const normalized = normalizePrestamoParams(base, anchor)
    return mapHorasParams(normalized ?? {})
  }

  if (BIOVIZION_RESOURCES_DEFAULT_TODAY.has(resource) && !hasPeriodParams(base)) {
    if (typeof base.status !== "string" || !base.status.trim()) {
      base.periodo = "hoy"
    }
  }

  return normalizePrestamoParams(base, anchor)
}

export const todayYmdBiovizion = (anchor = todayAnchor()): string => formatYmd(anchor)

const BIOVIZION_KEY_ALIASES: Record<string, string> = {
  enObra: "personasConPushInActivo",
}

/** Renombra claves confusas del hub para el modelo (p. ej. enObra → personasConPushInActivo). */
export const sanitizeBiovizionPayload = (value: unknown): unknown => {
  if (value == null || typeof value !== "object") {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeBiovizionPayload)
  }
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const mapped = BIOVIZION_KEY_ALIASES[key] ?? key
    out[mapped] = sanitizeBiovizionPayload(child)
  }
  return out
}
