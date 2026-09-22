import { api } from "@/lib/api"
import { normalizePrestamoParams } from "@/assistant/shared/period"
import { finishTool } from "../runtime"
import type { ToolRunResult } from "../types"

type QueryBancoArgs = {
  resource?: unknown
  params?: Record<string, unknown>
}

const BANCO_RESOURCES = new Set(["caja-chica", "ingresos", "egresos", "movimientos"])
const BANCO_QUERY_TIMEOUT_MS = 20_000

const toQueryString = (params: Record<string, string>): string => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value)
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

const toBancoQueryParams = (params: Record<string, unknown> | undefined): Record<string, string> => {
  const normalized = normalizePrestamoParams(params) ?? {}

  const query: Record<string, string> = {}
  if (typeof normalized.fecha === "string" && normalized.fecha) {
    query.from = normalized.fecha
    query.to = normalized.fecha
  } else if (typeof normalized.fechaInicio === "string" && typeof normalized.fechaFin === "string") {
    query.from = normalized.fechaInicio
    query.to = normalized.fechaFin
  }

  const limit = Number(normalized.limit)
  if (Number.isInteger(limit) && limit > 0) {
    query.limit = String(Math.min(limit, 500))
  }

  return query
}

const bancoPeriodFromQuery = (query: Record<string, string>) => {
  if (query.from && query.to) {
    return { fechaInicio: query.from, fechaFin: query.to, ...(query.from === query.to ? { fecha: query.from } : {}) }
  }
  return undefined
}

const enrichBancoResult = (
  result: Record<string, unknown>,
  resource: string,
  query: Record<string, string>,
): Record<string, unknown> => {
  const listResource = resource === "ingresos" || resource === "egresos" || resource === "movimientos"
  return {
    ...result,
    ok: true,
    resource,
    periodoConsultado: bancoPeriodFromQuery(query),
    contenido: listResource
      ? {
          tipo: "movimientos",
          campos: [
            "monto",
            "motivo",
            "fecha",
            "tipo",
            "registradoPor",
            "ingresoTipoLabel",
            "destinoLabel",
          ],
        }
      : {
          tipo: "resumen",
          campos: ["cajaChica", "totalIngresos", "totalEgresos", "periodo"],
          nota: "Sin filas ni motivo; usa resource ingresos, egresos o movimientos para el detalle.",
        },
    instruccion:
      "Answer using only this response and periodoConsultado. Do not mix prior queries. Speak in the user's language (same as their last message).",
  }
}

const slimBancoMovimiento = (item: unknown): Record<string, unknown> | unknown => {
  if (!item || typeof item !== "object") {
    return item
  }
  const source = item as Record<string, unknown>
  return {
    id: source.id,
    userId: source.userId,
    registradoPor: source.registradoPor,
    tipo: source.tipo,
    monto: source.monto,
    motivo:
      typeof source.motivo === "string" && source.motivo.trim()
        ? source.motivo.trim()
        : source.motivo ?? null,
    ingresoTipo: source.ingresoTipo ?? null,
    ingresoTipoLabel: source.ingresoTipoLabel ?? null,
    destino: source.destino ?? null,
    destinoLabel: source.destinoLabel ?? null,
    fecha: source.fecha,
  }
}

const queryBancoApi = async (path: string, query: Record<string, string>) => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), BANCO_QUERY_TIMEOUT_MS)
  try {
    return await api<Record<string, unknown>>(`/banco/${path}${toQueryString(query)}`, {
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timer)
  }
}

export const runQueryBanco = async (
  channel: RTCDataChannel,
  callId: string,
  raw: string,
): Promise<ToolRunResult> => {
  try {
    const parsed = JSON.parse(raw) as QueryBancoArgs
    const resource = typeof parsed.resource === "string" ? parsed.resource.trim() : ""
    if (!BANCO_RESOURCES.has(resource)) {
      return finishTool(channel, callId, {
        ok: false,
        message: "resource inválido para query_banco",
      })
    }

    const query = toBancoQueryParams(parsed.params)

    if (resource === "caja-chica") {
      const data = await queryBancoApi("resumen", query)
      return finishTool(channel, callId, enrichBancoResult({ data }, resource, query), { resource })
    }

    const tipo = resource === "movimientos" ? undefined : resource === "ingresos" ? "ingreso" : "egreso"
    const movQuery = { ...query, ...(tipo ? { tipo } : {}) }
    const payload = await queryBancoApi("movimientos", movQuery)
    const movimientos = Array.isArray(payload.movimientos)
      ? payload.movimientos.map(slimBancoMovimiento)
      : []

    const data: Record<string, unknown> = { movimientos }
    if (resource === "ingresos") {
      data.ingresos = movimientos
    } else if (resource === "egresos") {
      data.egresos = movimientos
    }

    return finishTool(channel, callId, enrichBancoResult({ data }, resource, query), { resource })
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "La consulta a Banco tardó demasiado"
        : error instanceof Error
          ? error.message
          : "No se pudo consultar Banco"
    return finishTool(channel, callId, {
      ok: false,
      message,
    })
  }
}

type CreateBancoMovimientoArgs = {
  tipo?: unknown
  monto?: unknown
  motivo?: unknown
  ingresoTipo?: unknown
  destino?: unknown
  fecha?: unknown
}

export const runCreateBancoMovimiento = async (
  channel: RTCDataChannel,
  callId: string,
  raw: string,
): Promise<ToolRunResult> => {
  try {
    const parsed = JSON.parse(raw) as CreateBancoMovimientoArgs
    const tipo = typeof parsed.tipo === "string" ? parsed.tipo.trim().toLowerCase() : ""
    const monto = typeof parsed.monto === "number" ? parsed.monto : Number(parsed.monto)
    const motivo = typeof parsed.motivo === "string" ? parsed.motivo.trim() : ""
    const fechaRaw = typeof parsed.fecha === "string" ? parsed.fecha.trim() : ""
    const fecha =
      fechaRaw && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)
        ? fechaRaw
        : normalizePrestamoParams({ periodo: "hoy" })?.fecha

    if (tipo !== "ingreso" && tipo !== "egreso") {
      return finishTool(channel, callId, { ok: false, message: "tipo debe ser ingreso o egreso" })
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      return finishTool(channel, callId, { ok: false, message: "El monto debe ser mayor a cero" })
    }
    if (!motivo) {
      return finishTool(channel, callId, { ok: false, message: "El motivo es obligatorio" })
    }
    if (!fecha || typeof fecha !== "string") {
      return finishTool(channel, callId, { ok: false, message: "Fecha inválida" })
    }
    const ingresoTipo = typeof parsed.ingresoTipo === "string" ? parsed.ingresoTipo.trim() : ""
    const destino = typeof parsed.destino === "string" ? parsed.destino.trim() : ""
    if (tipo === "ingreso" && !ingresoTipo) {
      return finishTool(channel, callId, {
        ok: false,
        message: "Tipo obligatorio para ingreso: recibido_por_edgar u otro",
      })
    }
    if (tipo === "egreso" && !destino) {
      return finishTool(channel, callId, {
        ok: false,
        message: "Destino obligatorio para egreso: ec_programming, atlas o construccion",
      })
    }

    const path = tipo === "ingreso" ? "ingresos" : "egresos"
    const result = await api<{ movimiento: Record<string, unknown> }>(`/banco/${path}`, {
      method: "POST",
      body: JSON.stringify({
        monto,
        motivo,
        fecha,
        ...(tipo === "ingreso" ? { ingresoTipo } : {}),
        ...(tipo === "egreso" ? { destino } : {}),
      }),
    })

    return finishTool(channel, callId, {
      ok: true,
      tipo,
      movimiento: slimBancoMovimiento(result.movimiento),
      instruccion: "Briefly confirm the Banco movement in the user's language.",
    })
  } catch (error) {
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo registrar el movimiento",
    })
  }
}
