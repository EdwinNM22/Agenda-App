import { api } from "@/lib/api"
import { getPwaRegistration, isIos, isSafari, isStandalone } from "@/lib/pwa"

const avisosLog = (...args: unknown[]) => {
  console.info("[avisos]", ...args)
}

const avisosError = (label: string, error: unknown) => {
  const extra =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : { error }
  console.error("[avisos]", label, extra, error)
}

const dumpEnvironment = () => ({
  href: window.location.href,
  protocol: window.location.protocol,
  host: window.location.host,
  isSecureContext: window.isSecureContext,
  standalone: isStandalone(),
  ios: isIos(),
  safari: isSafari(),
  userAgent: navigator.userAgent,
  notification: "Notification" in window,
  permission: "Notification" in window ? Notification.permission : "n/a",
  serviceWorker: "serviceWorker" in navigator,
  pushManager: "PushManager" in window,
  controller: Boolean(navigator.serviceWorker?.controller),
})

const dumpRegistration = (registration: ServiceWorkerRegistration | null | undefined) => {
  if (!registration) {
    return { registration: null }
  }
  return {
    scope: registration.scope,
    active: registration.active?.state ?? null,
    waiting: registration.waiting?.state ?? null,
    installing: registration.installing?.state ?? null,
    pushManager: Boolean(registration.pushManager),
  }
}

const dumpVapidKey = (publicKey: string) => {
  const trimmed = publicKey.trim()
  try {
    const bytes = urlBase64ToUint8Array(trimmed)
    return {
      chars: trimmed.length,
      bytes: bytes.byteLength,
      firstByte: bytes[0],
      uncompressed: bytes[0] === 4,
      hasWhitespace: trimmed !== publicKey,
      prefix: trimmed.slice(0, 6),
      suffix: trimmed.slice(-6),
    }
  } catch (error) {
    return {
      chars: trimmed.length,
      decodeError: error instanceof Error ? error.message : String(error),
    }
  }
}

const urlBase64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const binary = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Uint8Array(bytes)
}

const vapidApplicationServerKey = (publicKey: string) => {
  const bytes = urlBase64ToUint8Array(publicKey.trim())
  return new Uint8Array(bytes)
}

export const pushSupported = () =>
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window

export const pushNeedsStandalone = () => isIos() && !isStandalone()

export type PushStatus = "unsupported" | "insecure" | "standalone" | "denied" | "off" | "on"

export const describePushStatus = (status: PushStatus) => {
  if (status === "insecure") {
    return isSafari()
      ? "En Safari pulsa «Mostrar detalles» del aviso del certificado, visita el sitio y confía. Luego recarga."
      : "Acepta el certificado HTTPS (Avanzado → continuar) y recarga."
  }
  if (status === "standalone") {
    return "Safari en pestaña no puede avisar. En el iPhone: Compartir → Añadir a pantalla de inicio, y abre la app desde el icono (iOS 16.4 o más)."
  }
  if (status === "unsupported") {
    return isSafari()
      ? "Safari necesita la versión 16.4 o posterior, HTTPS y (en iPhone) abrir la app desde el icono de inicio."
      : "Este navegador no admite avisos web. Prueba Safari 16.4+ o Chrome, con HTTPS."
  }
  if (status === "denied") {
    return isIos()
      ? "Los avisos están bloqueados. En el iPhone: Ajustes → Notificaciones → EC Assistant (o Safari) → Permitir."
      : "Los avisos están bloqueados. En el Mac: Ajustes del Sistema → Notificaciones → Safari → Permitir."
  }
  if (status === "on") {
    return "Los avisos de tus tareas llegarán al teléfono."
  }
  return "Activa los avisos para que te avise a la hora de cada tarea."
}

export const currentPushStatus = async (): Promise<PushStatus> => {
  if (typeof window === "undefined") {
    return "unsupported"
  }
  avisosLog("estado: entorno", dumpEnvironment())
  if (!window.isSecureContext) {
    avisosLog("estado → insecure")
    return "insecure"
  }
  if (pushNeedsStandalone()) {
    avisosLog("estado → standalone (iOS en pestaña)")
    return "standalone"
  }
  if (!pushSupported()) {
    avisosLog("estado → unsupported")
    return "unsupported"
  }
  if (Notification.permission === "denied") {
    avisosLog("estado → denied")
    return "denied"
  }
  const registration = await getPwaRegistration()
  avisosLog("estado: service worker", dumpRegistration(registration))
  const subscription = await registration?.pushManager.getSubscription()
  avisosLog("estado: suscripción existente", Boolean(subscription), subscription?.endpoint ?? null)
  if (Notification.permission === "granted" && subscription) {
    avisosLog("estado → on")
    return "on"
  }
  avisosLog("estado → off")
  return "off"
}

export const syncPushSubscription = async (registration?: ServiceWorkerRegistration | null) => {
  avisosLog("sync: inicio", {
    supported: pushSupported(),
    needsStandalone: pushNeedsStandalone(),
    permission: "Notification" in window ? Notification.permission : "n/a",
  })
  if (!pushSupported() || pushNeedsStandalone() || Notification.permission !== "granted") {
    avisosLog("sync: abortado por entorno o permiso")
    return false
  }
  const ready = registration ?? (await getPwaRegistration())
  avisosLog("sync: registration", dumpRegistration(ready))
  if (!ready) {
    avisosLog("sync: no hay service worker")
    return false
  }
  avisosLog("sync: pidiendo clave VAPID a /push/vapid-public-key")
  const { publicKey } = await api<{ publicKey: string }>("/push/vapid-public-key")
  if (!publicKey?.trim()) {
    throw new Error("El servidor no tiene las claves de avisos (VAPID).")
  }
  avisosLog("sync: clave VAPID", dumpVapidKey(publicKey))
  let subscription = await ready.pushManager.getSubscription()
  avisosLog("sync: suscripción previa", Boolean(subscription), subscription?.endpoint ?? null)
  if (!subscription) {
    const applicationServerKey = vapidApplicationServerKey(publicKey)
    avisosLog("sync: llamando pushManager.subscribe", {
      userVisibleOnly: true,
      keyBytes: applicationServerKey.byteLength,
      keyType: applicationServerKey.constructor.name,
    })
    try {
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
      avisosLog("sync: subscribe OK", subscription.endpoint)
    } catch (error) {
      avisosError("sync: pushManager.subscribe falló", error)
      throw error
    }
  }
  avisosLog("sync: guardando suscripción en /push/subscribe")
  await api("/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  })
  avisosLog("sync: guardada en el servidor")
  return true
}

const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  try {
    const result = Notification.requestPermission()
    if (typeof result === "string") {
      return result
    }
    return await result
  } catch {
    return Notification.permission
  }
}

export const enablePush = async () => {
  avisosLog("activar: inicio", dumpEnvironment())
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error(describePushStatus("insecure"))
  }
  if (pushNeedsStandalone()) {
    throw new Error(describePushStatus("standalone"))
  }
  if (!pushSupported()) {
    throw new Error(describePushStatus("unsupported"))
  }

  avisosLog("activar: pidiendo clave VAPID y service worker")
  const [{ publicKey }, registration] = await Promise.all([
    api<{ publicKey: string }>("/push/vapid-public-key"),
    getPwaRegistration(),
  ])
  avisosLog("activar: clave VAPID", publicKey ? dumpVapidKey(publicKey) : null)
  avisosLog("activar: service worker", dumpRegistration(registration))
  if (!publicKey?.trim()) {
    throw new Error("El servidor no tiene las claves de avisos (VAPID).")
  }
  if (!registration) {
    throw new Error("El service worker no está listo. Recarga la PWA e inténtalo otra vez.")
  }

  avisosLog("activar: pidiendo permiso Notification.permission actual =", Notification.permission)
  const permission = await requestNotificationPermission()
  avisosLog("activar: permiso resultado =", permission)
  if (permission !== "granted") {
    throw new Error("No se concedió permiso para avisos")
  }

  try {
    const ok = await syncPushSubscription(registration)
    avisosLog("activar: sync resultado =", ok)
    if (!ok) {
      throw new Error("No se pudo activar el aviso. Recarga e inténtalo otra vez.")
    }
    avisosLog("activar: listo")
  } catch (error) {
    avisosError("activar: falló", error)
    const message = error instanceof Error ? error.message : ""
    if (/push service/i.test(message) || /Registration failed/i.test(message)) {
      throw new Error(
        "Safari no pudo registrar el aviso. Quita la app de inicio, vuelve a añadirla y ábrela desde el icono. El sitio debe ser https://tudominio.com (un dominio, no una IP).",
      )
    }
    throw new Error(message || "No se pudo activar el aviso")
  }
}
