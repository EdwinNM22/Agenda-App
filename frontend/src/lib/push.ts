import { api } from "@/lib/api"
import { getPwaRegistration, isIos, isStandalone } from "@/lib/pwa"

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
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window

export const pushNeedsStandalone = () => isIos() && !isStandalone()

export type PushStatus = "unsupported" | "standalone" | "denied" | "off" | "on"

export const describePushStatus = (status: PushStatus) => {
  if (status === "unsupported") {
    return "Este navegador no admite avisos. Usa Chrome o Safari, con HTTPS."
  }
  if (status === "standalone") {
    return "En iPhone, instala la app en inicio y ábrela desde ahí."
  }
  if (status === "denied") {
    return "Los avisos están bloqueados. Actívalos en Ajustes del sistema."
  }
  if (status === "on") {
    return "Los avisos de tus tareas llegarán al teléfono."
  }
  return "Activa los avisos para que te avise a la hora de cada tarea."
}

export const currentPushStatus = async (): Promise<PushStatus> => {
  if (!pushSupported()) {
    return "unsupported"
  }
  if (pushNeedsStandalone()) {
    return "standalone"
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

export const enablePush = async () => {
  if (!pushSupported()) {
    throw new Error("Este dispositivo no admite avisos")
  }
  if (pushNeedsStandalone()) {
    throw new Error("Instala la app en la pantalla de inicio y ábrela desde ahí")
  }
  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error("No se concedió permiso para avisos")
  }
  const ok = await syncPushSubscription()
  if (!ok) {
    throw new Error("No se pudo activar el aviso. Recarga la app e inténtalo otra vez.")
  }
}
