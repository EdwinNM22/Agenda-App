import { config } from "../../config.js"

export type PrestamoHubResult<T = unknown> = {
  ok: boolean
  data?: T
  message?: string
  error?: string
  fetchedAt: string
  status?: number
}

const hubBasePath = (): string => {
  const tenant = config.prestamo.tenant
  if (tenant === "system" || tenant === "prestamo") {
    return "/system/integrations/hub"
  }
  return "/integrations/hub"
}

const buildUrl = (resource: string, query?: Record<string, string | undefined>): string => {
  const base = `${config.prestamo.apiUrl}${hubBasePath()}/${resource}`
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

export const fetchPrestamoHub = async <T = unknown>(
  resource: string,
  query?: Record<string, string | undefined>,
): Promise<PrestamoHubResult<T>> => {
  const fetchedAt = new Date().toISOString()

  if (!config.prestamo.hubApiKey) {
    return {
      ok: false,
      error: "Integración con PrestamoApp no configurada (falta PRESTAMO_HUB_API_KEY)",
      fetchedAt,
      status: 503,
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.prestamo.timeoutMs)

  try {
    const response = await fetch(buildUrl(resource, query), {
      method: "GET",
      headers: {
        "X-API-Key": config.prestamo.hubApiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    const payload = (await response.json().catch(() => ({}))) as {
      message?: string
      data?: T
    }

    if (!response.ok) {
      return {
        ok: false,
        error: payload.message ?? `PrestamoApp respondió ${response.status}`,
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
        ? "PrestamoApp no respondió a tiempo"
        : error instanceof Error
          ? error.message
          : "No se pudo contactar PrestamoApp"
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

export const resourceToHubPath = (slug: string): string => {
  if (slug === "caja-chica-detalle") {
    return "caja-chica/detalle"
  }
  return slug
}
