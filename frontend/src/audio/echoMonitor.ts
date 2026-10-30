import { setAudioSessionType } from "./audioSession"
import { createEchoGate, type EchoGateState } from "./echoGate"

/**
 * Mide el micrófono (el que sale hacia el servidor, ya procesado por el AEC del navegador) y la
 * voz remota (la que suena por el altavoz) y alimenta el detector de voz real vs. eco.
 *
 * Solo ANALIZA: no está en la ruta del audio. Si Web Audio falla o se suspende, la llamada sigue
 * igual y `healthy` pasa a false para que la sesión vuelva al comportamiento nativo del servidor.
 */

export type EchoMonitorState = EchoGateState & {
  /** El análisis es fiable (contexto activo y el micrófono entrega señal). */
  healthy: boolean
  /** Hay referencia remota usable. Si no, el detector es más conservador. */
  refReliable: boolean
  micLevel: number
  refLevel: number
}

export type EchoMonitor = {
  readonly state: EchoMonitorState
  subscribe: (listener: (state: EchoMonitorState, now: number) => void) => () => void
  /** Pista de eventos del servidor: el asistente está reproduciendo audio. */
  setPlayingHint: (playing: boolean) => void
  /** Cambia el micrófono (p. ej. tras recuperarlo) sin reiniciar el análisis. */
  setMicStream: (stream: MediaStream) => void
  /** Una «voz del usuario» confirmada era eco. */
  reportFalsePositive: () => void
  destroy: () => void
}

const TICK_MS = 30
const FFT_SIZE = 1024
/** Sin señal digital en el micrófono durante este tiempo: el análisis no es fiable. */
const MIC_SIGNAL_TIMEOUT_MS = 2500
/** Con el asistente hablando (según el servidor) y sin ver nada en la referencia: no es fiable. */
const REF_BLIND_AFTER_MS = 1500

type LevelProbe = {
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  nodes: AudioNode[]
  buffer: Float32Array<ArrayBuffer>
}

const createProbe = (context: AudioContext, stream: MediaStream): LevelProbe | null => {
  if (stream.getAudioTracks().length === 0) {
    return null
  }
  try {
    const source = context.createMediaStreamSource(stream)
    // Banda de voz: quita graves/ruido de fondo y siseo que no aportan a decidir «hay voz».
    const highpass = context.createBiquadFilter()
    highpass.type = "highpass"
    highpass.frequency.value = 150
    const lowpass = context.createBiquadFilter()
    lowpass.type = "lowpass"
    lowpass.frequency.value = 3800
    const analyser = context.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = 0
    source.connect(highpass)
    highpass.connect(lowpass)
    lowpass.connect(analyser)
    return {
      source,
      analyser,
      nodes: [highpass, lowpass],
      buffer: new Float32Array(new ArrayBuffer(FFT_SIZE * 4)),
    }
  } catch {
    return null
  }
}

const disposeProbe = (probe: LevelProbe | null) => {
  if (!probe) {
    return
  }
  try {
    probe.source.disconnect()
    probe.nodes.forEach((node) => node.disconnect())
    probe.analyser.disconnect()
  } catch {
    // ya desconectado
  }
}

const readRms = (probe: LevelProbe | null): number | null => {
  if (!probe) {
    return null
  }
  probe.analyser.getFloatTimeDomainData(probe.buffer)
  let sum = 0
  for (let i = 0; i < probe.buffer.length; i += 1) {
    const value = probe.buffer[i]!
    sum += value * value
  }
  return Math.sqrt(sum / probe.buffer.length)
}

export const createEchoMonitor = (
  micStream: MediaStream,
  remoteStream: MediaStream | null,
): EchoMonitor | null => {
  if (typeof AudioContext === "undefined") {
    return null
  }

  let context: AudioContext
  try {
    context = new AudioContext({ latencyHint: "interactive" })
  } catch {
    return null
  }

  const gate = createEchoGate()
  const listeners = new Set<(state: EchoMonitorState, now: number) => void>()
  let micProbe = createProbe(context, micStream)
  let refProbe = remoteStream ? createProbe(context, remoteStream) : null

  let playingHint = false
  let hintSince = 0
  let refSeenSinceHint = false
  // Se asume que NO hay referencia hasta verla (en iOS el audio remoto puede llegar mudo al análisis).
  let refReliable = false
  let lastMicSignalAt = 0
  let startedAt = performance.now()

  let state: EchoMonitorState = {
    playout: false,
    userVoice: false,
    userVoiceStarted: false,
    threshold: 0,
    coupling: 1,
    noiseFloor: 0.004,
    healthy: false,
    refReliable,
    micLevel: 0,
    refLevel: 0,
  }

  const resumeContext = () => {
    if (context.state === "closed") {
      return
    }
    void context
      .resume()
      .then(() => setAudioSessionType("play-and-record"))
      .catch(() => undefined)
  }
  resumeContext()

  // iOS/Safari pueden dejar el contexto «suspended»/«interrupted» (llamada entrante, segundo plano).
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      resumeContext()
    }
  }
  const onGesture = () => resumeContext()
  context.addEventListener("statechange", () => {
    if (context.state !== "running") {
      resumeContext()
    }
  })
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("pointerdown", onGesture, { passive: true })

  const tick = () => {
    const now = performance.now()
    const mic = readRms(micProbe)
    const refRaw = readRms(refProbe)

    if (mic !== null && mic > 1e-5) {
      lastMicSignalAt = now
    }

    if (playingHint && refRaw !== null && refRaw > 0.004) {
      refSeenSinceHint = true
    }
    if (refRaw !== null && refRaw > 0.004) {
      refReliable = true
    } else if (
      playingHint &&
      !refSeenSinceHint &&
      hintSince > 0 &&
      now - hintSince > REF_BLIND_AFTER_MS
    ) {
      // El servidor dice que el asistente habla y la referencia sigue muda: no hay referencia útil.
      refReliable = false
    }

    const healthy =
      context.state === "running" &&
      mic !== null &&
      lastMicSignalAt > 0 &&
      now - lastMicSignalAt < MIC_SIGNAL_TIMEOUT_MS &&
      now - startedAt > 200

    const gateState = gate.push({
      now,
      mic: mic ?? 0,
      ref: refProbe && refReliable ? (refRaw ?? 0) : null,
      playingHint,
    })

    state = {
      ...gateState,
      healthy,
      refReliable: refProbe !== null && refReliable,
      micLevel: mic ?? 0,
      refLevel: refRaw ?? 0,
    }

    listeners.forEach((listener) => {
      try {
        listener(state, now)
      } catch {
        // un listener no puede tumbar el monitor
      }
    })
  }

  const interval = window.setInterval(tick, TICK_MS)

  return {
    get state() {
      return state
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setPlayingHint: (playing) => {
      if (playing === playingHint) {
        return
      }
      playingHint = playing
      if (playing) {
        hintSince = performance.now()
        refSeenSinceHint = false
      }
    },
    setMicStream: (stream) => {
      disposeProbe(micProbe)
      micProbe = createProbe(context, stream)
      lastMicSignalAt = 0
      startedAt = performance.now()
      resumeContext()
    },
    reportFalsePositive: () => gate.reportFalsePositive(),
    destroy: () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pointerdown", onGesture)
      disposeProbe(micProbe)
      disposeProbe(refProbe)
      micProbe = null
      refProbe = null
      listeners.clear()
      void context.close().catch(() => undefined)
    },
  }
}
