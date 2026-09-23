import { config } from "../../config.js"

export type BiovizionHubResult<T = unknown> = {
  ok: boolean
  data?: T
  message?: string
  error?: string
  fetchedAt: string
  status?: number
}

const buildUrl = (resource: string, query?: Record<string, string | undefined>): string => {
  const base = `${config.biovizion.apiUrl}/integrations/hub/${resource}`
  if (!query) {
    return base
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, value)
    }
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export const fetchBiovizionHub = async <T = unknown>(
  resource: string,
  query?: Record<string, string | undefined>,
): Promise<BiovizionHubResult<T>> => {
  const fetchedAt = new Date().toISOString()

  if (!config.biovizion.hubApiKey) {
    return {
      ok: false,
      error: "Integración con Biovizion no configurada (falta BIOVIZION_HUB_API_KEY)",
      fetchedAt,
      status: 503,
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.biovizion.timeoutMs)

  const headers: Record<string, string> = {
    "X-API-Key": config.biovizion.hubApiKey,
    Accept: "application/json",
  }
  if (config.biovizion.instanceHost) {
    headers.Host = config.biovizion.instanceHost
  }

  try {
    const response = await fetch(buildUrl(resource, query), {
      method: "GET",
      headers,
      signal: controller.signal,
    })

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string
      data?: T
    }

    if (!response.ok) {
      return {
        ok: false,
        error: payload.message ?? `Biovizion respondió ${response.status}`,
        message: payload.message,
        fetchedAt,
        status: response.status,
      }
    }

    return {
      ok: true,
      data: payload.data,
      message: payload.message,
      fetchedAt,
      status: response.status,
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Biovizion no respondió a tiempo"
        : error instanceof Error
          ? error.message
          : "No se pudo contactar Biovizion"
    return {
      ok: false,
      error: message,
      fetchedAt,
      status: 502,
    }
  } finally {
    clearTimeout(timer)
  }
}
