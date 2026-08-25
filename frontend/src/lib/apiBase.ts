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

const withPath = (path: string): string => (path.startsWith("/") ? path : `/${path}`)

const withoutApiPrefix = (path: string): string => path.replace(/^\/api(?=\/)/, "")

export const apiUrl = (path: string): string => {
  const suffix = withPath(path)
  const origin = apiOrigin()
  return origin ? `${origin}${suffix}` : suffix
}

export const assetUrl = (url: string | null | undefined): string => {
  if (!url) {
    return ""
  }
  if (/^(https?:|blob:|data:)/i.test(url)) {
    return url
  }
  const relative = withoutApiPrefix(url.startsWith("/") ? url : `/${url}`)
  const origin = apiOrigin()
  if (!origin) {
    return relative
  }
  return `${origin}${relative}`
}

export const wsUrl = (path: string): string => {
  const suffix = withPath(path)
  const origin = apiOrigin()
  if (origin) {
    const wsOrigin = origin.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")
    return `${wsOrigin}${suffix}`
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}${suffix}`
}
