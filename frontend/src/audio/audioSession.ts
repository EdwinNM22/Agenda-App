type AudioSessionType =
  | "auto"
  | "playback"
  | "transient"
  | "transient-solo"
  | "ambient"
  | "play-and-record"

type NavigatorWithAudioSession = Navigator & {
  audioSession?: { type: AudioSessionType }
}

const MIC_GRANTED_KEY = "agenda.micGranted"

let stopPreview: (() => void) | undefined
let heldStream: MediaStream | null = null
let releasingHeld = false
let openingMic: Promise<MediaStream> | null = null

export const registerVoicePreviewStop = (stop: (() => void) | undefined) => {
  stopPreview = stop
}

export const stopVoicePreviews = () => {
  stopPreview?.()
}

export const setAudioSessionType = (type: AudioSessionType) => {
  const session = (navigator as NavigatorWithAudioSession).audioSession
  if (!session) {
    return
  }
  try {
    session.type = type
  } catch {
    // Safari puede rechazar el tipo si la sesión no está activa.
  }
}

const isMissingCaptureDevice = (err: unknown) => {
  const name = err instanceof DOMException ? err.name : ""
  const message = err instanceof Error ? err.message : String(err)
  return (
    name === "NotFoundError" ||
    name === "OverconstrainedError" ||
    /AVAudioSessionCaptureDevice|Requested device not found|device not found/i.test(message)
  )
}

const micProcessing: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

const rememberMicGranted = () => {
  try {
    localStorage.setItem(MIC_GRANTED_KEY, "1")
  } catch {
    // modo privado
  }
}

const applyBrowserAec = (stream: MediaStream) => {
  stream.getAudioTracks().forEach((track) => {
    void track.applyConstraints(micProcessing).catch(() => undefined)
  })
  return stream
}

const liveAudioTracks = (stream: MediaStream | null) =>
  stream?.getAudioTracks().filter((track) => track.readyState === "live") ?? []

const requestMic = () =>
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })

const bindHeldStream = (stream: MediaStream) => {
  heldStream = stream
  stream.getAudioTracks().forEach((track) => {
    track.addEventListener(
      "ended",
      () => {
        if (!releasingHeld && liveAudioTracks(heldStream).length === 0) {
          heldStream = null
        }
      },
      { once: true },
    )
  })
  rememberMicGranted()
  setAudioSessionType("play-and-record")
  return stream
}

const queryMicPermission = async (): Promise<"granted" | "denied" | "prompt" | "unknown"> => {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName })
    if (status.state === "granted") {
      rememberMicGranted()
    }
    return status.state
  } catch {
    try {
      return localStorage.getItem(MIC_GRANTED_KEY) === "1" ? "granted" : "unknown"
    } catch {
      return "unknown"
    }
  }
}

export const captureMicrophone = async (): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "El micrófono solo funciona con HTTPS. Abre la página con https:// y vuelve a intentar.",
    )
  }

  stopVoicePreviews()

  const live = liveAudioTracks(heldStream)
  if (heldStream && live.length > 0) {
    live.forEach((track) => {
      track.enabled = true
    })
    setAudioSessionType("play-and-record")
    return heldStream
  }
  heldStream = null

  if (openingMic) {
    return openingMic
  }

  openingMic = (async () => {
    // No tocar audioSession antes del prompt: en iOS eso dispara otro aviso
    // (a veces de cámara) y el sistema no llega a guardar "Permitir".
    await queryMicPermission()

    const open = async () => applyBrowserAec(await requestMic())

    try {
      return bindHeldStream(await open())
    } catch (err) {
      if (!isMissingCaptureDevice(err)) {
        throw err
      }
      setAudioSessionType("play-and-record")
      return bindHeldStream(await open())
    }
  })().finally(() => {
    openingMic = null
  })

  return openingMic
}

export const releaseMicrophone = () => {
  releasingHeld = true
  heldStream?.getTracks().forEach((track) => {
    track.stop()
  })
  heldStream = null
  releasingHeld = false
}

export const releaseCallAudioSession = () => {
  // No volver a "playback": iOS pierde el dispositivo de captura y vuelve a pedir permiso.
  setAudioSessionType("auto")
}

export const describeMicError = (err: unknown) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "El micrófono solo funciona con HTTPS. Abre la página con https:// y vuelve a intentar."
  }
  const name = err instanceof DOMException ? err.name : ""
  const message = err instanceof Error ? err.message : String(err)
  if (name === "NotAllowedError" || /permission|denied|not allowed/i.test(message)) {
    const pwa =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    if (pwa) {
      return "El micrófono está bloqueado. En Ajustes → Agenda → Micrófono, elige Permitir."
    }
    return "El micrófono está bloqueado. En Ajustes del navegador, permite el micrófono para este sitio."
  }
  if (isMissingCaptureDevice(err)) {
    return "No se pudo abrir el micrófono. Cierra otras apps de audio, recarga y toca otra vez."
  }
  if (name === "NotReadableError") {
    return "El micrófono está ocupado por otra app. Ciérrala y vuelve a tocar el botón."
  }
  return err instanceof Error ? err.message : "No se pudo iniciar la conversación"
}
