export const normalizeApiOrigin = (raw: string | undefined): string => {
  const value = raw?.trim().replace(/\/$/, "") ?? ""
  if (!value || value === "undefined" || value === "null") {
    return ""
  }
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  const withPort = /:\d+$/.test(value) ? value : `${value}:3001`
  return `http://${withPort}`
}

export const apiOrigin = (): string => normalizeApiOrigin(import.meta.env.VITE_API_URL)

export const apiUrl = (path: string): string => {
  const suffix = path.startsWith("/") ? path : `/${path}`
  const withApi = suffix.startsWith("/api/") || suffix === "/api" ? suffix : `/api${suffix}`
  const origin = apiOrigin()
  return origin ? `${origin}${withApi}` : withApi
}

export const assetUrl = (url: string | null | undefined): string => {
  if (!url) {
    return ""
  }
  if (/^(https?:|blob:|data:)/i.test(url)) {
    return url
  }
  const origin = apiOrigin()
  if (!origin) {
    return url
  }
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`
}

export const wsUrl = (path: string): string => {
  const suffix = path.startsWith("/") ? path : `/${path}`
  const withApi = suffix.startsWith("/api/") ? suffix : `/api${suffix}`
  const origin = apiOrigin()
  if (origin) {
    const wsOrigin = origin.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")
    return `${wsOrigin}${withApi}`
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}${withApi}`
}
