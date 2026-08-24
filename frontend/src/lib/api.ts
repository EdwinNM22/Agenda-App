import { apiUrl, assetUrl } from "@/lib/apiBase"
import { REALTIME_VOICES } from "@/lib/voices"

export type PublicUser = {
  id: number
  email: string
  name: string
  avatarUrl: string | null
  avatarThumbUrl: string | null
  theme: "light" | "dark" | "wallpaper"
  wallpaperUrl: string | null
  wallpaperX: number
  wallpaperY: number
  wallpaperZoom: number
  wallpaperColor: string | null
}

type ApiError = {
  message?: string
}

export const withAssetHost = <T extends PublicUser>(user: T): T => ({
  ...user,
  avatarUrl: assetUrl(user.avatarUrl) || null,
  avatarThumbUrl: assetUrl(user.avatarThumbUrl) || null,
  wallpaperUrl: assetUrl(user.wallpaperUrl) || null,
})

export const api = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem("token")
  const headers = new Headers(options.headers)
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData

  if (!headers.has("Content-Type") && options.body && !isFormData) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
  })

  const payload = (await response.json().catch(() => ({}))) as T & ApiError

  if (!response.ok) {
    throw new Error(payload.message ?? "No se pudo completar la solicitud")
  }

  return payload
}

export const updateProfile = (body: {
  name?: string
  email?: string
  currentPassword?: string
  newPassword?: string
  theme?: "light" | "dark" | "wallpaper"
  wallpaperX?: number
  wallpaperY?: number
  wallpaperZoom?: number
}) => api<{ token?: string; user: PublicUser }>("/auth/me", {
  method: "PATCH",
  body: JSON.stringify(body),
})

export const uploadWallpaper = (
  file: File,
  frame?: { x: number; y: number; zoom: number },
) => {
  const form = new FormData()
  form.append("x", String(frame?.x ?? 50))
  form.append("y", String(frame?.y ?? 50))
  form.append("zoom", String(frame?.zoom ?? 1))
  form.append("wallpaper", file)
  return api<{ user: PublicUser }>("/auth/me/wallpaper", {
    method: "POST",
    body: form,
  })
}

const voicePreviewCache = new Map<string, Blob>()
const voicePreviewInflight = new Map<string, Promise<Blob>>()

const voicePreviewKey = (voice: string, name: string) => `${voice}:${name.trim().toLowerCase()}`

export const previewVoice = async (voice: string, name: string, signal?: AbortSignal) => {
  const key = voicePreviewKey(voice, name)
  const cached = voicePreviewCache.get(key)
  if (cached) {
    return cached
  }

  const pending = voicePreviewInflight.get(key)
  if (pending) {
    return pending
  }

  const token = localStorage.getItem("token")
  const request = fetch(apiUrl("/realtime/preview"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ voice, name }),
    signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("No se pudo reproducir la voz")
      }
      const blob = await response.blob()
      voicePreviewCache.set(key, blob)
      return blob
    })
    .finally(() => {
      voicePreviewInflight.delete(key)
    })

  voicePreviewInflight.set(key, request)
  return request
}

export const prefetchVoicePreviews = (name: string) => {
  const firstName = name.trim().split(/\s+/)[0] || "ahí"
  void (async () => {
    for (let index = 0; index < REALTIME_VOICES.length; index += 3) {
      await Promise.all(
        REALTIME_VOICES.slice(index, index + 3).map((voice) =>
          previewVoice(voice, firstName).catch(() => undefined),
        ),
      )
    }
  })()
}

export const uploadAvatar = (file: File) => {
  const form = new FormData()
  form.append("avatar", file)
  return api<{ user: PublicUser }>("/auth/me/avatar", {
    method: "POST",
    body: form,
  })
}
