import { createAssistantSpeechLog, judgeTranscriptAgainstAssistant } from "./echoTranscript"
import type { EchoMonitor, EchoMonitorState } from "./echoMonitor"

/**
 * Evita que la voz del asistente (que vuelve por el micrófono con el altavoz) se interprete como
 * una intervención del usuario, sin silenciar nunca el micrófono ni desactivar la detección.
 *
 * Problema de origen: el VAD del servidor solo ve audio. Con `interrupt_response` y
 * `create_response` activos, cualquier eco residual corta la respuesta y luego crea otra a partir
 * de la transcripción del propio eco. Esta capa mueve esas dos decisiones al cliente, que SÍ sabe
 * qué está sonando:
 *
 *  1. Mientras el asistente suena, el servidor no interrumpe ni crea respuestas por su cuenta.
 *  2. El cliente decide la interrupción voluntaria (`EchoMonitor`): voz sostenida por encima del
 *     eco esperado → `response.cancel` + `output_audio_buffer.clear`. Es el mismo derecho a
 *     interrumpir de siempre, pero basado en «¿es más fuerte que mi propio eco?».
 *  3. Cada segmento de voz que el servidor detecta se clasifica (¿se solapó con la reproducción?,
 *     ¿lo confirmó el detector local?). Los dudosos se verifican por CONTENIDO contra lo que dijo
 *     el asistente: si es eco se descarta (y se borra del contexto del modelo); si no, se atiende
 *     al terminar de hablar el asistente. Una petición legítima nunca se pierde.
 *  4. Si el análisis local no es fiable (Web Audio suspendido, sin señal), se vuelve al
 *     comportamiento nativo del servidor.
 */

/** Margen para el retardo con el que el servidor avisa de que empezó una voz. */
const OVERLAP_LOOKBACK_MS = 450
/** Ventana en la que una voz confirmada localmente se atribuye al segmento que avisa el servidor. */
const CONFIRM_WINDOW_MS = 1500
/** Para volver al modo nativo, el análisis debe llevar un tiempo sin ser fiable (evita parpadeos). */
const UNHEALTHY_GRACE_MS = 1000
/** Un corte por «voz del usuario» cuya transcripción repite al asistente casi literal es eco. */
const ECHO_CUT_COVERAGE = 0.85
const ECHO_CUT_MIN_TOKENS = 3

type Segment = {
  startedAt: number
  stoppedAt: number | null
  /** Se solapó con audio del asistente (o con su cola inmediata). */
  overlap: boolean
  /** El detector local confirmó voz del usuario por encima del eco. */
  confirmed: boolean
  /** Esta voz cortó la reproducción del asistente. */
  bargedIn: boolean
}

type Sender = (payload: unknown) => boolean

export type VoiceGuardOptions = {
  /** Envía un evento al servidor; devuelve false si el canal no está abierto. */
  send: Sender
  log: (label: string, extra?: unknown) => void
  /** El usuario habla de verdad (no es eco): para el estado visual y la detección de silencio. */
  onHearingUser: (active: boolean) => void
}

export type TranscriptVerdict = "accept" | "echo"

export type VoiceGuard = {
  attachMonitor: (monitor: EchoMonitor | null) => void
  /** Turnos automáticos permitidos (false durante el saludo inicial). */
  setTurnTaking: (enabled: boolean) => void
  /** Reenvía la configuración de turnos (p. ej. tras reconectar el canal). */
  syncTurnDetection: () => void
  handleEvent: (event: Record<string, unknown>) => void
  judgeTranscript: (itemId: string | undefined, heard: string) => TranscriptVerdict
  /** Hay una petición legítima esperando a que el asistente termine de hablar. */
  hasDeferredRequest: () => boolean
  destroy: () => void
}

const str = (value: unknown): string => (typeof value === "string" ? value : "")

export const createVoiceGuard = ({ send, log, onHearingUser }: VoiceGuardOptions): VoiceGuard => {
  const speechLog = createAssistantSpeechLog()
  const segments = new Map<string, Segment>()

  let monitor: EchoMonitor | null = null
  let unsubscribe: (() => void) | null = null
  let last: EchoMonitorState | null = null

  let baseTurnTaking = false
  let managed = false
  let unhealthySince = 0
  let lastTurnKey = ""

  let playoutEvents = false
  /** Algún `output_audio_buffer.*` llegó: el servidor informa de cuándo suena el asistente. */
  let sawPlayoutEvents = false
  /** El modelo está generando audio de salida (llega por delante de la reproducción). */
  let audioGenerating = false
  let hasPlayedAudio = false
  let responseActive = 0
  /** Tras una interrupción voluntaria, deja crear la respuesta a lo que dijo el usuario. */
  let releaseHold = false
  let lastPlayingAt = -Infinity
  let lastUserVoiceAt = -Infinity
  let lastBargeInAt = -Infinity
  let deferredRequest = false
  let hearing = false

  const now = () => performance.now()
  const isPlaying = () => playoutEvents || Boolean(last?.playout)

  /**
   * Solo se puede gestionar la interrupción en el cliente si se sabe cuándo suena el asistente:
   * por la señal remota o por los eventos del servidor. Antes del primer audio se asume que sí.
   */
  const canObservePlayout = (state: EchoMonitorState) =>
    state.refReliable || sawPlayoutEvents || !hasPlayedAudio

  const setHearing = (active: boolean) => {
    if (hearing === active) {
      return
    }
    hearing = active
    onHearingUser(active)
  }

  const openSuspect = () => {
    for (const segment of segments.values()) {
      if (segment.stoppedAt === null && segment.overlap && !segment.confirmed) {
        return true
      }
    }
    return false
  }

  const hasOpenSegment = () => {
    for (const segment of segments.values()) {
      if (segment.stoppedAt === null) {
        return true
      }
    }
    return false
  }

  const syncTurnDetection = () => {
    const holdCreate =
      managed && !releaseHold && (isPlaying() || responseActive > 0 || openSuspect())
    const create = baseTurnTaking && !holdCreate
    // Con el análisis local fiable, la interrupción la decide el cliente; si no, el servidor.
    const interrupt = !managed
    const key = `${create}|${interrupt}`
    if (key === lastTurnKey) {
      return
    }
    const sent = send({
      type: "session.update",
      session: {
        audio: {
          input: {
            turn_detection: {
              type: "semantic_vad",
              eagerness: "low",
              interrupt_response: interrupt,
              create_response: create,
            },
          },
        },
      },
    })
    if (sent) {
      lastTurnKey = key
    }
  }

  const flushDeferredRequest = () => {
    if (!deferredRequest || !baseTurnTaking) {
      return
    }
    if (isPlaying() || responseActive > 0 || hasOpenSegment()) {
      return
    }
    deferredRequest = false
    log("atendió petición que se dijo mientras el asistente hablaba")
    send({ type: "response.create" })
  }

  const bargeIn = (at: number) => {
    lastBargeInAt = at
    releaseHold = true
    log("interrupción voluntaria: voz del usuario por encima del eco")
    if (responseActive > 0) {
      send({ type: "response.cancel" })
    }
    send({ type: "output_audio_buffer.clear" })
    playoutEvents = false
    for (const segment of segments.values()) {
      if (segment.stoppedAt === null) {
        segment.bargedIn = true
      }
    }
  }

  const onMonitorTick = (state: EchoMonitorState, at: number) => {
    last = state

    if (state.healthy && canObservePlayout(state)) {
      unhealthySince = 0
      if (!managed) {
        managed = true
        log("detección local de voz activa", {
          refReliable: state.refReliable,
        })
      }
    } else {
      if (unhealthySince === 0) {
        unhealthySince = at
      }
      if (managed && at - unhealthySince > UNHEALTHY_GRACE_MS) {
        managed = false
        releaseHold = false
        log("detección local no fiable: se usa la interrupción nativa del servidor")
      }
    }

    monitor?.setPlayingHint(playoutEvents || audioGenerating)

    const playing = isPlaying()
    if (playing) {
      lastPlayingAt = at
    }
    if (state.userVoice) {
      lastUserVoiceAt = at
    }

    for (const segment of segments.values()) {
      if (segment.stoppedAt !== null) {
        continue
      }
      if (playing) {
        segment.overlap = true
      }
      if (state.userVoice && !segment.confirmed) {
        segment.confirmed = true
        setHearing(true)
      }
    }

    if (state.userVoiceStarted && managed && playing) {
      bargeIn(at)
    }

    flushDeferredRequest()
    syncTurnDetection()
  }

  const handleEvent = (event: Record<string, unknown>) => {
    const type = str(event.type)
    const at = now()

    if (type === "response.created") {
      responseActive += 1
      releaseHold = false
    } else if (type === "response.done") {
      responseActive = Math.max(0, responseActive - 1)
      audioGenerating = false
      const response = event.response as { id?: string } | undefined
      if (response?.id) {
        speechLog.done(response.id)
      }
    } else if (type === "output_audio_buffer.started") {
      playoutEvents = true
      sawPlayoutEvents = true
    } else if (type === "response.output_audio.delta" || type === "response.audio.delta") {
      audioGenerating = true
      hasPlayedAudio = true
    } else if (type === "response.output_audio.done" || type === "response.audio.done") {
      audioGenerating = false
    } else if (
      type === "output_audio_buffer.stopped" ||
      type === "output_audio_buffer.cleared"
    ) {
      playoutEvents = false
    } else if (type.includes("audio_transcript.delta")) {
      const responseId = str(event.response_id)
      if (responseId) {
        speechLog.delta(responseId, str(event.delta))
      }
    } else if (type.includes("audio_transcript.done")) {
      const responseId = str(event.response_id)
      if (responseId) {
        speechLog.done(responseId, str(event.transcript) || undefined)
      }
    } else if (type === "input_audio_buffer.speech_started") {
      const itemId = str(event.item_id)
      const playing = isPlaying()
      const overlap = playing || at - lastPlayingAt < OVERLAP_LOOKBACK_MS
      const confirmed = at - lastUserVoiceAt < CONFIRM_WINDOW_MS
      if (segments.size > 24) {
        const oldest = segments.keys().next().value
        if (oldest !== undefined) {
          segments.delete(oldest)
        }
      }
      if (itemId) {
        segments.set(itemId, {
          startedAt: at,
          stoppedAt: null,
          overlap,
          confirmed,
          bargedIn: at - lastBargeInAt < CONFIRM_WINDOW_MS,
        })
      }
      // Solo se marca «oyendo al usuario» si no hay duda de que es eco.
      setHearing(!overlap || confirmed)
    } else if (type === "conversation.item.input_audio_transcription.failed") {
      segments.delete(str(event.item_id))
    } else if (type === "input_audio_buffer.speech_stopped") {
      const segment = segments.get(str(event.item_id))
      if (segment) {
        segment.stoppedAt = at
      }
      setHearing(false)
    }

    flushDeferredRequest()
    syncTurnDetection()
  }

  const judgeTranscript = (itemId: string | undefined, heard: string): TranscriptVerdict => {
    const segment = itemId ? segments.get(itemId) : undefined
    if (itemId) {
      segments.delete(itemId)
    }
    if (!segment || !segment.overlap) {
      return "accept"
    }

    const verdict = judgeTranscriptAgainstAssistant(heard, speechLog.recent())

    // Un corte que provocó el eco: el «usuario» repite al asistente casi literal mientras suena.
    if (
      segment.bargedIn &&
      verdict.tokens >= ECHO_CUT_MIN_TOKENS &&
      verdict.coverage >= ECHO_CUT_COVERAGE
    ) {
      log("el corte lo causó el eco del asistente; se ajusta el umbral", heard)
      monitor?.reportFalsePositive()
      if (itemId) {
        send({ type: "conversation.item.delete", item_id: itemId })
      }
      return "echo"
    }

    // Voz confirmada por el detector local: es del usuario, no se discute.
    if (segment.confirmed) {
      return "accept"
    }

    if (verdict.isEcho) {
      log("transcripción descartada: es eco del asistente", heard)
      if (itemId) {
        send({ type: "conversation.item.delete", item_id: itemId })
      }
      return "echo"
    }

    // Dudosa pero no es eco: es una petición real hablada encima (o pegada) al asistente.
    // El servidor no la atendió porque estaba hablando: se atiende cuando termine.
    if (managed && (isPlaying() || responseActive > 0)) {
      deferredRequest = true
    }
    return "accept"
  }

  const attachMonitor = (next: EchoMonitor | null) => {
    unsubscribe?.()
    unsubscribe = null
    monitor = next
    last = null
    managed = false
    unhealthySince = 0
    if (next) {
      unsubscribe = next.subscribe(onMonitorTick)
    }
    syncTurnDetection()
  }

  return {
    attachMonitor,
    setTurnTaking: (enabled) => {
      baseTurnTaking = enabled
      syncTurnDetection()
    },
    syncTurnDetection: () => {
      lastTurnKey = ""
      syncTurnDetection()
    },
    handleEvent,
    judgeTranscript,
    hasDeferredRequest: () => deferredRequest,
    destroy: () => {
      unsubscribe?.()
      unsubscribe = null
      monitor = null
      segments.clear()
      speechLog.clear()
      setHearing(false)
    },
  }
}
