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
    /AVAudioSessionCaptureDevice|Requested device not found|device not found/i.test(message)
  )
}

const micProcessing: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

const applyBrowserAec = (stream: MediaStream) => {
  stream.getAudioTracks().forEach((track) => {
    void track.applyConstraints(micProcessing).catch(() => undefined)
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

  const open = () => navigator.mediaDevices.getUserMedia({ audio: true })

  try {
    const stream = applyBrowserAec(await open())
    setAudioSessionType("play-and-record")
    return stream
  } catch (err) {
    if (!isMissingCaptureDevice(err)) {
      throw err
    }
    setAudioSessionType("play-and-record")
    return applyBrowserAec(await open())
  }
}

export const stopMicrophone = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop())
}

export const releaseCallAudioSession = () => {
  setAudioSessionType("auto")
}

export const describeMicError = (err: unknown) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "El micrófono solo funciona con HTTPS. Abre la página con https:// y vuelve a intentar."
  }
  const name = err instanceof DOMException ? err.name : ""
  const message = err instanceof Error ? err.message : String(err)
  if (name === "NotAllowedError" || /permission|denied|not allowed/i.test(message)) {
    return "El micrófono está bloqueado."
  }
  if (isMissingCaptureDevice(err)) {
    return "No se pudo abrir el micrófono. Cierra otras apps de audio, recarga y toca otra vez."
  }
  if (name === "NotReadableError") {
    return "El micrófono está ocupado por otra app. Ciérrala y vuelve a tocar el botón."
  }
  return err instanceof Error ? err.message : "No se pudo iniciar la conversación"
}
