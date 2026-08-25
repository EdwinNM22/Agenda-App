import { api } from "@/lib/api"
import { getPwaRegistration, isIos, isSafari, isStandalone } from "@/lib/pwa"

const urlBase64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const binary = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
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
      ? "Los avisos están bloqueados. En el iPhone: Ajustes → Notificaciones → Agenda (o Safari) → Permitir."
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
  if (!window.isSecureContext) {
    return "insecure"
  }
  if (pushNeedsStandalone()) {
    return "standalone"
  }
  if (!pushSupported()) {
    return "unsupported"
  }
  if (Notification.permission === "denied") {
    return "denied"
  }
  const registration = await getPwaRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (Notification.permission === "granted" && subscription) {
    return "on"
  }
  return "off"
}

export const syncPushSubscription = async () => {
  if (!pushSupported() || pushNeedsStandalone() || Notification.permission !== "granted") {
    return false
  }
  const registration = await getPwaRegistration()
  if (!registration) {
    return false
  }
  const { publicKey } = await api<{ publicKey: string }>("/push/vapid-public-key")
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }
  await api("/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  })
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
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error(describePushStatus("insecure"))
  }
  if (pushNeedsStandalone()) {
    throw new Error(describePushStatus("standalone"))
  }
  if (!pushSupported()) {
    throw new Error(describePushStatus("unsupported"))
  }
  const permission = await requestNotificationPermission()
  if (permission !== "granted") {
    throw new Error("No se concedió permiso para avisos")
  }
  const registration = await getPwaRegistration()
  if (!registration) {
    throw new Error("El service worker no está listo. Recarga la página con HTTPS e inténtalo otra vez.")
  }
  try {
    const ok = await syncPushSubscription()
    if (!ok) {
      throw new Error("No se pudo activar el aviso. Recarga e inténtalo otra vez.")
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "No se pudo activar el aviso")
  }
}
