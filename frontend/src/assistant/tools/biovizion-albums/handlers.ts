import { api } from "@/lib/api"
import { applyBiovizionDefaultPeriod, sanitizeBiovizionPayload } from "@/assistant/shared/biovizion-query"
import { finishTool } from "../runtime"
import type { ToolRunResult } from "../types"

type QueryBiovizionArgs = {
  resource?: unknown
  params?: Record<string, unknown>
}

const BIOVIZION_RESOURCE_SLUGS: Record<string, string> = {
  resumen: "resumen",
  proyectos: "proyectos",
  reportes: "reportes",
  citas: "citas",
  dre: "dre",
  asistencia: "asistencia",
  personas: "personas",
  ubicaciones: "ubicaciones",
  horas: "horas",
  equipo: "equipo",
  "push-pendientes": "push-pendientes",
  inconsistencias: "inconsistencias",
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
    if (typeof value === "boolean") {
      search.set(key, value ? "true" : "false")
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

const BIOVIZION_QUERY_TIMEOUT_MS = 20_000

const periodFromResult = (
  data: unknown,
  params: Record<string, unknown> | undefined,
): { fechaInicio?: string; fechaFin?: string; date?: string } | undefined => {
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
  const date =
    (typeof params?.date === "string" && params.date) ||
    (typeof payload?.date === "string" && payload.date) ||
    undefined

  if (!fechaInicio && !fechaFin && !date) {
    return undefined
  }

  return { fechaInicio, fechaFin, date }
}

const enrichBiovizionResult = (
  result: Record<string, unknown>,
  resource: string,
  params: Record<string, unknown> | undefined,
): Record<string, unknown> => ({
  ...result,
  resource,
  periodoConsultado: periodFromResult(result.data, params),
  instruccion:
    resource === "horas"
      ? "Natural answer from JSON: userNameFilter, fechaInicio–fechaFin, totalHours (closed sessions only), byDay in prose. If activePushIns has items, mention open push-in (projectTitle, pushIn) not counted in totalHours. Optional offer of sessions detail. Forbidden in user-facing text: obra, en obra, enObra. User's language."
      : "Answer from JSON only. personasConPushInActivo = people with active push-in on a project. Never read JSON keys aloud. Forbidden in user-facing text: obra, en obra, enObra and any phrase containing obra. Say proyecto(s). User's language.",
})

const queryBiovizionApi = async (slug: string, params: Record<string, unknown> | undefined) => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), BIOVIZION_QUERY_TIMEOUT_MS)
  try {
    return await api<Record<string, unknown>>(
      `/api/integrations/biovizion/${slug}${toQueryString(params)}`,
      { signal: controller.signal },
    )
  } finally {
    window.clearTimeout(timer)
  }
}

export const runQueryBiovizion = async (
  channel: import("@/lib/realtimeChannel").RealtimeChannel,
  callId: string,
  raw: string,
): Promise<ToolRunResult> => {
  try {
    const parsed = JSON.parse(raw) as QueryBiovizionArgs
    const resource = typeof parsed.resource === "string" ? parsed.resource.trim() : ""
    const slug = BIOVIZION_RESOURCE_SLUGS[resource]
    if (!slug) {
      return finishTool(channel, callId, {
        ok: false,
        message: "resource inválido para query_biovizion",
      })
    }

    const params = applyBiovizionDefaultPeriod(resource, parsed.params)
    const result = await queryBiovizionApi(slug, params)
    const data =
      result.ok && result.data !== undefined
        ? sanitizeBiovizionPayload(result.data)
        : result.data

    if (result.ok && data !== undefined) {
      return finishTool(
        channel,
        callId,
        enrichBiovizionResult(
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
    return finishTool(channel, callId, enrichBiovizionResult(result, resource, params))
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "La consulta a Biovizion tardó demasiado"
        : error instanceof Error
          ? error.message
          : "No se pudo consultar Biovizion"
    return finishTool(channel, callId, {
      ok: false,
      message,
    })
  }
}
