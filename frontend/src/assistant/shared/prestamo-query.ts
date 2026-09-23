import { formatYmd, normalizePrestamoParams } from "@/assistant/shared/period"

const startOfDay = (date: Date): Date => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const todayAnchor = (): Date => startOfDay(new Date())

/** Recursos Atlas que deben acotarse al día si el usuario no dio período. */
export const ATLAS_RESOURCES_DEFAULT_TODAY = new Set([
  "caja-chica",
  "caja-chica-detalle",
  "ingresos",
  "egresos",
  "desembolsos",
  "pagos",
  "cuotas",
  "creditos",
])

const hasPeriodParams = (params: Record<string, unknown>): boolean =>
  Boolean(
    (typeof params.periodo === "string" && params.periodo.trim()) ||
      (typeof params.fecha === "string" && params.fecha.trim()) ||
      (typeof params.fechaInicio === "string" && params.fechaInicio.trim()) ||
      (typeof params.fechaFin === "string" && params.fechaFin.trim()) ||
      params.year != null,
  )

export const applyAtlasDefaultPeriod = (
  resource: string,
  params: Record<string, unknown> | undefined,
  anchor = todayAnchor(),
): Record<string, unknown> | undefined => {
  if (!ATLAS_RESOURCES_DEFAULT_TODAY.has(resource)) {
    return normalizePrestamoParams(params, anchor)
  }

  const base = { ...(params ?? {}) }
  if (!hasPeriodParams(base)) {
    base.periodo = "hoy"
  }
  return normalizePrestamoParams(base, anchor)
}

export const applyBancoDefaultPeriod = (
  params: Record<string, unknown> | undefined,
  anchor = todayAnchor(),
): Record<string, unknown> | undefined => {
  const base = { ...(params ?? {}) }
  if (!hasPeriodParams(base)) {
    base.periodo = "hoy"
  }
  return normalizePrestamoParams(base, anchor)
}

const FORBIDDEN_ATLAS_KEYS = new Set([
  "liquidacionhoy",
  "liquidacion",
  "liquidez",
  "totalinvertido",
  "totalventas",
])

/** Quita KPIs globales / términos que Isi no debe narrar (viene del hub /resumen o /liquidez). */
export const sanitizePrestamoPayload = (value: unknown): unknown => {
  if (value == null || typeof value !== "object") {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(sanitizePrestamoPayload)
  }

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_ATLAS_KEYS.has(key.toLowerCase())) {
      continue
    }
    if (key.toLowerCase() === "cartera" && child && typeof child === "object" && !Array.isArray(child)) {
      continue
    }
    out[key] = sanitizePrestamoPayload(child)
  }
  return out
}

export const todayYmd = (anchor = todayAnchor()): string => formatYmd(anchor)
