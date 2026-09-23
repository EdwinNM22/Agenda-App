import { api } from "@/lib/api"
import { applyAtlasDefaultPeriod, sanitizePrestamoPayload } from "@/assistant/shared/prestamo-query"
import { finishTool } from "../runtime"
import type { ToolRunResult } from "../types"

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
  "cuotas-vencidas": "cuotas-vencidas",
  cuotas: "cuotas",
  creditos: "creditos",
  clientes: "clientes",
  pagos: "pagos",
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
      "Answer using only this response and periodoConsultado (day-scoped unless user asked for global/historical totals). Do not mention liquidación, liquidez or global portfolio KPIs unless present and explicitly requested. Do not mix prior queries. Speak in the user's language.",
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

export const runQueryPrestamo = async (
  channel: import("@/lib/realtimeChannel").RealtimeChannel,
  callId: string,
  raw: string,
): Promise<ToolRunResult> => {
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

    const params = applyAtlasDefaultPeriod(resource, parsed.params)

    const result = await queryPrestamoApi(slug, params)
    const data =
      result.ok && result.data !== undefined
        ? sanitizePrestamoPayload(trimPrestamoData(resource, result.data))
        : result.data

    if (result.ok && data !== undefined) {
      return finishTool(
        channel,
        callId,
        enrichPrestamoResult(
          {
            ...result,
            data,
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
