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

/**
 * Procesado de audio que se PIDE al abrir el micrófono (no después con `applyConstraints`:
 * Safari/iOS y varios Android lo ignoran cuando la pista ya está abierta).
 *
 * - `echoCancellation` y `noiseSuppression`: esenciales con altavoz. El AEC del navegador es el único
 *   que conoce el retardo real de reproducción del dispositivo.
 * - `autoGainControl` desactivado: el AGC va después del AEC y sube el nivel del eco residual
 *   (que suena a voz) hasta parecer una intervención del usuario.
 * - `voiceIsolation`: restricción experimental (Chrome en algunas plataformas); si no existe se ignora.
 *
 * Todo con `ideal`: nunca rechaza el acceso por una restricción no soportada. Lo que realmente
 * quedó activo se comprueba después con `describeMicProcessing`.
 */
const PROCESSING_CONSTRAINTS = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: false },
  channelCount: { ideal: 1 },
  voiceIsolation: { ideal: true },
} as MediaTrackConstraints

export type MicProcessing = {
  /** `null` = el navegador no informa del ajuste (p. ej. Safari antiguo). */
  echoCancellation: boolean | null
  noiseSuppression: boolean | null
  autoGainControl: boolean | null
}

const settingToBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value
  }
  // Chrome moderno puede informar un tipo («all», «system», «remote-only»): hay cancelación.
  if (typeof value === "string") {
    return value !== "none"
  }
  return null
}

export const describeMicProcessing = (stream: MediaStream): MicProcessing => {
  const settings = (stream.getAudioTracks()[0]?.getSettings() ?? {}) as Record<string, unknown>
  return {
    echoCancellation: settingToBoolean(settings.echoCancellation),
    noiseSuppression: settingToBoolean(settings.noiseSuppression),
    autoGainControl: settingToBoolean(settings.autoGainControl),
  }
}

/** Plataforma, solo para diagnóstico: el procesado de audio se comporta distinto en cada una. */
export const describeAudioPlatform = (): string => {
  const ua = navigator.userAgent
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(ua)
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua)
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const os = ios ? "ios" : android ? "android" : "desktop"
  return `${os}${safari ? "/safari" : ""}${standalone ? "/pwa" : ""}`
}

/**
 * Si el navegador abrió el micrófono sin cancelación de eco, se intenta pedirla una vez más con
 * `applyConstraints` (algunos motores sí lo aceptan). Devuelve el estado final.
 */
const ensureEchoCancellation = async (stream: MediaStream): Promise<MediaStream> => {
  if (describeMicProcessing(stream).echoCancellation !== false) {
    return stream
  }
  await Promise.all(
    stream.getAudioTracks().map((track) =>
      track
        .applyConstraints({ echoCancellation: true, noiseSuppression: true })
        .catch(() => undefined),
    ),
  )
  return stream
}

const isUnsupportedConstraint = (err: unknown) => {
  const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : ""
  return name === "OverconstrainedError" || name === "TypeError"
}

export const captureMicrophone = async (): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "El micrófono solo funciona con HTTPS. Abre la página con https:// y vuelve a intentar.",
    )
  }

  stopVoicePreviews()

  // De más a menos exigente: si el navegador no entiende alguna restricción, se abre con lo básico.
  const tiers: MediaStreamConstraints[] = [{ audio: PROCESSING_CONSTRAINTS }, { audio: true }]

  const open = async (): Promise<MediaStream> => {
    let lastError: unknown
    for (const constraints of tiers) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints)
      } catch (err) {
        lastError = err
        if (!isUnsupportedConstraint(err)) {
          throw err
        }
      }
    }
    throw lastError
  }

  try {
    const stream = await ensureEchoCancellation(await open())
    setAudioSessionType("play-and-record")
    return stream
  } catch (err) {
    if (!isMissingCaptureDevice(err)) {
      throw err
    }
    setAudioSessionType("play-and-record")
    return ensureEchoCancellation(await open())
  }
}

export type MicLossReason = "ended" | "muted" | "denied"

/** Si el micrófono sigue silenciado por el sistema más de esto (con la app visible), se reabre. */
const MUTED_TOO_LONG_MS = 4000

/**
 * Vigila que el micrófono siga disponible durante la llamada: dispositivo desconectado o cerrado
 * por el sistema (`ended`), silenciado por una interrupción que no termina (`muted`) o permiso
 * revocado (`denied`). El que llama decide cómo recuperarlo.
 */
export const watchMicrophone = (
  stream: MediaStream,
  onLost: (reason: MicLossReason) => void,
): (() => void) => {
  const track = stream.getAudioTracks()[0]
  if (!track) {
    return () => undefined
  }

  let disposed = false
  let mutedTimer = 0

  const lose = (reason: MicLossReason) => {
    if (!disposed) {
      onLost(reason)
    }
  }
  const clearMutedTimer = () => {
    window.clearTimeout(mutedTimer)
    mutedTimer = 0
  }
  const armMutedTimer = () => {
    clearMutedTimer()
    mutedTimer = window.setTimeout(() => {
      if (track.muted && track.readyState === "live") {
        lose("muted")
      }
    }, MUTED_TOO_LONG_MS)
  }

  const onEnded = () => lose("ended")
  const onMute = () => {
    // Una interrupción breve (llamada entrante, Siri) se recupera sola con `unmute`.
    if (document.visibilityState === "visible") {
      armMutedTimer()
    }
  }
  const onUnmute = () => clearMutedTimer()
  const onVisibility = () => {
    if (document.visibilityState !== "visible") {
      clearMutedTimer()
      return
    }
    if (track.readyState === "ended") {
      lose("ended")
    } else if (track.muted) {
      armMutedTimer()
    }
  }
  const onDeviceChange = () => {
    if (track.readyState === "ended") {
      lose("ended")
    }
  }

  track.addEventListener("ended", onEnded)
  track.addEventListener("mute", onMute)
  track.addEventListener("unmute", onUnmute)
  document.addEventListener("visibilitychange", onVisibility)
  navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange)

  let permission: PermissionStatus | null = null
  const onPermission = () => {
    if (permission?.state === "denied") {
      lose("denied")
    }
  }
  // Safari/iOS no soporta consultar el permiso del micrófono: se ignora sin más.
  void navigator.permissions
    ?.query({ name: "microphone" as PermissionName })
    .then((status) => {
      if (disposed) {
        return
      }
      permission = status
      status.addEventListener("change", onPermission)
    })
    .catch(() => undefined)

  return () => {
    disposed = true
    clearMutedTimer()
    track.removeEventListener("ended", onEnded)
    track.removeEventListener("mute", onMute)
    track.removeEventListener("unmute", onUnmute)
    document.removeEventListener("visibilitychange", onVisibility)
    navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange)
    permission?.removeEventListener("change", onPermission)
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
  if (name === "NotReadableError" || name === "AbortError") {
    return "El micrófono está ocupado por otra app. Ciérrala y vuelve a tocar el botón."
  }
  if (name === "SecurityError") {
    return "El navegador no permite usar el micrófono en esta página. Revisa los permisos del sitio."
  }
  return err instanceof Error ? err.message : "No se pudo iniciar la conversación"
}
