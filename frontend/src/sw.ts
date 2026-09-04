/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core"
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"
import { ExpirationPlugin } from "workbox-expiration"
import { NetworkOnly, StaleWhileRevalidate } from "workbox-strategies"

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0]
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting()
  }
})

clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const apiPrefixes = ["/auth", "/tasks", "/realtime", "/health", "/ws", "/push", "/api"]

registerRoute(
  ({ url }) => apiPrefixes.some((prefix) => url.pathname.startsWith(prefix)),
  new NetworkOnly(),
)

registerRoute(
  ({ url }) => url.pathname.startsWith("/uploads/"),
  new StaleWhileRevalidate({
    cacheName: "agenda-uploads",
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  }),
)

try {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL("index.html"), {
      denylist: [
        /^\/auth(?:\/|$)/,
        /^\/tasks(?:\/|$)/,
        /^\/realtime(?:\/|$)/,
        /^\/health(?:\/|$)/,
        /^\/uploads(?:\/|$)/,
        /^\/ws(?:\/|$)/,
        /^\/push(?:\/|$)/,
        /^\/api(?:\/|$)/,
      ],
    }),
  )
} catch {
  // En `vite dev` el precache puede no incluir index.html; el SW igual sirve para push.
}

type PushPayload = {
  title?: string
  body?: string
  url?: string
  taskId?: number
}

self.addEventListener("push", (event) => {
  let data: PushPayload = {}
  try {
    data = (event.data?.json() ?? {}) as PushPayload
  } catch {
    data = {}
  }
  const title = data.title?.trim() || "Agenda"
  const options: NotificationOptions = {
    body: data.body?.trim() || "Tienes un recordatorio",
    icon: "/pwa/icon-192x192.jpg",
    badge: "/pwa/icon-192x192.jpg",
    data: { url: data.url || "/tareas", taskId: data.taskId },
    tag: data.taskId ? `task-${data.taskId}` : "agenda",
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = String(event.notification.data?.url || "/tareas")
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus()
          if ("navigate" in client) {
            await client.navigate(target)
          }
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
