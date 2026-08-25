import { captureMicrophone, stopMicrophone } from "@/audio/audioSession"
import {
  currentPushStatus,
  describePushStatus,
  enablePush,
  syncPushSubscription,
  type PushStatus,
} from "@/lib/push"

const MIC_STORAGE_KEY = "agenda.micPermission"

export type PermissionState = "granted" | "denied" | "prompt" | "unsupported" | "standalone"

export type AppPermissionId = "notifications" | "microphone"

export type AppPermission = {
  id: AppPermissionId
  title: string
  granted: boolean
  state: PermissionState
  hint: string
}

const storedMic = (): "granted" | "denied" | null => {
  try {
    const value = localStorage.getItem(MIC_STORAGE_KEY)
    return value === "granted" || value === "denied" ? value : null
  } catch {
    return null
  }
}

const rememberMic = (state: "granted" | "denied") => {
  try {
    localStorage.setItem(MIC_STORAGE_KEY, state)
  } catch {
    // ignore
  }
}

export const currentMicStatus = async (): Promise<PermissionState> => {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unsupported"
  }
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName })
    if (status.state === "granted") {
      rememberMic("granted")
      return "granted"
    }
    if (status.state === "denied") {
      rememberMic("denied")
      return "denied"
    }
    return "prompt"
  } catch {
    return storedMic() ?? "prompt"
  }
}

export const enableMicrophone = async (options?: { persistDenial?: boolean }) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("El micrófono solo funciona con HTTPS.")
  }
  try {
    const stream = await captureMicrophone()
    stopMicrophone(stream)
    rememberMic("granted")
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ""
    if (name === "NotAllowedError" && options?.persistDenial) {
      rememberMic("denied")
    }
    throw error
  }
}

const notificationState = (status: PushStatus): PermissionState => {
  if (status === "on") {
    return "granted"
  }
  if (status === "off") {
    return "prompt"
  }
  return status
}

const describeMic = (state: PermissionState) => {
  if (state === "granted") {
    return "Listo para hablar con EC"
  }
  if (state === "denied") {
    return "Bloqueado. Actívalo en Ajustes del sistema."
  }
  if (state === "unsupported") {
    return "Hace falta HTTPS para usar el micrófono."
  }
  return "Para hablar con el asistente"
}

export const listAppPermissions = async (): Promise<AppPermission[]> => {
  const [notifications, microphone] = await Promise.all([currentPushStatus(), currentMicStatus()])
  return [
    {
      id: "notifications",
      title: "Avisos",
      granted: notifications === "on",
      state: notificationState(notifications),
      hint: describePushStatus(notifications),
    },
    {
      id: "microphone",
      title: "Micrófono",
      granted: microphone === "granted",
      state: microphone,
      hint: describeMic(microphone),
    },
  ]
}

export const requestAppPermission = async (id: AppPermissionId) => {
  if (id === "notifications") {
    await enablePush()
    return
  }
  await enableMicrophone({ persistDenial: true })
}

let promptLock: Promise<void> | null = null
let promptedThisSession = false

export const promptAppPermissions = async (interactive = false) => {
  if (promptLock) {
    return promptLock
  }

  promptLock = (async () => {
    const notifications = await currentPushStatus()
    if (notifications === "on") {
      await syncPushSubscription().catch(() => undefined)
    } else if (notifications === "off" && !promptedThisSession) {
      await enablePush().catch(() => undefined)
    }

    const microphone = await currentMicStatus()
    if (microphone === "prompt" && !promptedThisSession) {
      await enableMicrophone({ persistDenial: interactive }).catch(() => undefined)
    }

    promptedThisSession = true
  })().finally(() => {
    promptLock = null
  })

  return promptLock
}
