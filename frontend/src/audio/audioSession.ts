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

let stopPreview: (() => void) | undefined

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

const micConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

const requestMic = (audio: boolean | MediaTrackConstraints = micConstraints) =>
  navigator.mediaDevices.getUserMedia({ audio })

const applyBrowserAec = (stream: MediaStream) => {
  stream.getAudioTracks().forEach((track) => {
    void track.applyConstraints(micConstraints).catch(() => undefined)
  })
  return stream
}

export const captureMicrophone = async (): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "El micrófono solo funciona con HTTPS. Abre la página con https:// y vuelve a intentar.",
    )
  }

  stopVoicePreviews()
  // playback (p. ej. preview de voz) deja a iOS sin dispositivos de captura.
  setAudioSessionType("auto")
  setAudioSessionType("play-and-record")

  const grab = async () => {
    try {
      return applyBrowserAec(await requestMic(micConstraints))
    } catch (err) {
      if (err instanceof DOMException && err.name === "OverconstrainedError") {
        return applyBrowserAec(await requestMic(true))
      }
      throw err
    }
  }

  try {
    return await grab()
  } catch (err) {
    if (!isMissingCaptureDevice(err)) {
      throw err
    }
    setAudioSessionType("auto")
    setAudioSessionType("play-and-record")
    return applyBrowserAec(await requestMic(true))
  }
}

export const releaseCallAudioSession = () => {
  setAudioSessionType("playback")
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
      return "El micrófono está bloqueado. En Ajustes → Agenda → Micrófono, permite el acceso y vuelve a tocar."
    }
    return "Safari bloqueó el micrófono. En Ajustes → Safari → Micrófono, permite este sitio y recarga."
  }
  if (isMissingCaptureDevice(err)) {
    return "Safari no pudo abrir el micrófono. Cierra otras apps de audio, recarga la página y toca otra vez el botón."
  }
  if (name === "NotReadableError") {
    return "El micrófono está ocupado por otra app. Ciérrala y vuelve a tocar el botón."
  }
  return err instanceof Error ? err.message : "No se pudo iniciar la conversación"
}
