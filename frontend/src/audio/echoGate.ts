/**
 * Detector de «voz real del usuario» frente al eco de la propia voz del asistente.
 *
 * Es un detector de doble habla (double-talk) adaptativo, sin Web Audio ni DOM: recibe
 * niveles RMS del micrófono (ya procesado por el AEC del navegador) y de la voz remota
 * (la que se reproduce por el altavoz) y decide si lo que entra por el micrófono supera
 * lo que cabe esperar del eco.
 *
 *  - eco esperado = acoplamiento `k` × nivel remoto reciente (el eco llega con retardo, por
 *    eso se usa el máximo de una ventana y no el nivel instantáneo);
 *  - `k` se aprende solo durante la reproducción: sube rápido (si el eco real es mayor de lo
 *    previsto) y baja despacio; no aprende mientras se confirma voz del usuario, para que
 *    hablar encima del asistente no «enseñe» al detector que ese nivel es eco;
 *  - con auriculares `k` cae al mínimo y el umbral pasa a depender solo del ruido de fondo;
 *  - la voz se confirma si supera el umbral de forma sostenida (no por un pico aislado).
 */

export type EchoGateOptions = {
  /** Nivel RMS remoto a partir del cual hay audio del asistente. */
  refActive: number
  /** Cuánto se considera «sonando» tras el último audio remoto (cubre pausas entre palabras). */
  playoutHoldMs: number
  /** Ventana (ms) del máximo del nivel remoto: retardo altavoz → micrófono. */
  delayWindowMs: number
  /** Voz mínima absoluta del usuario (RMS). */
  absMin: number
  /** Múltiplo del ruido de fondo que debe superar. */
  noiseMargin: number
  /** Cuántas veces por encima del eco esperado. */
  echoMargin: number
  /** Voz por encima del umbral, acumulada, para confirmar. */
  sustainMs: number
  /** Cuánto se mantiene «voz confirmada» tras el último frame por encima. */
  releaseMs: number
  /** Acoplamiento inicial (conservador: se asume eco fuerte hasta medirlo). */
  kInitial: number
  kMin: number
  kMax: number
  /** Umbral absoluto cuando no hay referencia remota fiable (más alto: no se sabe qué es eco). */
  absNoRef: number
}

export const DEFAULT_ECHO_GATE_OPTIONS: EchoGateOptions = {
  refActive: 0.004,
  playoutHoldMs: 350,
  delayWindowMs: 400,
  absMin: 0.008,
  noiseMargin: 3,
  echoMargin: 2.4,
  sustainMs: 200,
  releaseMs: 600,
  kInitial: 1,
  kMin: 0.02,
  kMax: 2,
  absNoRef: 0.06,
}

export type EchoGateInput = {
  /** Reloj en ms (monótono). */
  now: number
  /** RMS del micrófono (0..1). */
  mic: number
  /** RMS de la voz remota (0..1), o null si no hay referencia fiable. */
  ref: number | null
  /** Pista externa (eventos del servidor): el asistente está reproduciendo audio. */
  playingHint?: boolean
}

export type EchoGateState = {
  /** El asistente suena (o sonó hace menos de `playoutHoldMs`), según la señal remota. */
  playout: boolean
  /** Hay voz del usuario por encima del eco esperado, de forma sostenida. */
  userVoice: boolean
  /** Transición a `userVoice` en este frame (para disparar una sola vez). */
  userVoiceStarted: boolean
  /** Umbral de voz que se está aplicando (RMS). */
  threshold: number
  /** Acoplamiento altavoz → micrófono aprendido. */
  coupling: number
  noiseFloor: number
}

export type EchoGate = {
  push: (input: EchoGateInput) => EchoGateState
  /**
   * Una «voz del usuario» confirmada resultó ser eco (lo dice el contenido de la transcripción).
   * Sube el acoplamiento para no repetir el corte.
   */
  reportFalsePositive: () => void
  reset: () => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const createEchoGate = (overrides: Partial<EchoGateOptions> = {}): EchoGate => {
  const opts = { ...DEFAULT_ECHO_GATE_OPTIONS, ...overrides }

  let lastNow = 0
  let ring: Array<{ at: number; ref: number }> = []
  let lastRefActiveAt = -Infinity
  let noiseFloor = 0.004
  let coupling = opts.kInitial
  let sustain = 0
  let confirmed = false
  let lastAboveAt = -Infinity
  /** Máximo `mic / eco-esperado` visto durante la voz confirmada actual. */
  let confirmedRatioPeak = 0

  const reset = () => {
    lastNow = 0
    ring = []
    lastRefActiveAt = -Infinity
    noiseFloor = 0.004
    coupling = opts.kInitial
    sustain = 0
    confirmed = false
    lastAboveAt = -Infinity
    confirmedRatioPeak = 0
  }

  const push = ({ now, mic, ref, playingHint = false }: EchoGateInput): EchoGateState => {
    const dt = lastNow === 0 ? 0 : Math.min(200, now - lastNow)
    lastNow = now

    const refLevel = ref ?? 0
    ring.push({ at: now, ref: refLevel })
    const cutoff = now - opts.delayWindowMs
    while (ring.length > 0 && ring[0]!.at < cutoff) {
      ring.shift()
    }
    const refEnv = ring.reduce((max, item) => (item.ref > max ? item.ref : max), 0)

    if (refLevel > opts.refActive) {
      lastRefActiveAt = now
    }
    const refReliable = ref !== null
    const playout =
      now - lastRefActiveAt < opts.playoutHoldMs || (!refReliable && playingHint)

    // Ruido de fondo: solo cuando no suena el asistente. Baja rápido, sube despacio.
    if (!playout && !confirmed) {
      noiseFloor += (mic - noiseFloor) * (mic < noiseFloor ? 0.3 : 0.01)
      noiseFloor = clamp(noiseFloor, 0.002, 0.03)
    }

    const thresholdFor = (k: number) =>
      Math.max(
        opts.absMin,
        noiseFloor * opts.noiseMargin,
        k * refEnv * opts.echoMargin + noiseFloor * 1.5,
      )

    let threshold: number
    if (refReliable) {
      threshold = thresholdFor(coupling)
      // Aprende el acoplamiento solo con referencia clara y sin voz confirmada. Un frame que ya
      // supera el umbral es candidato a voz del usuario: no puede «enseñar» que eso es eco
      // (si de verdad era eco, `reportFalsePositive` lo corrige con el contenido).
      if (refEnv > opts.refActive * 3 && !confirmed) {
        const ratio = Math.min(4, mic / refEnv)
        if (ratio <= coupling) {
          coupling += (ratio - coupling) * 0.12
        } else if (mic <= threshold) {
          coupling += (ratio - coupling) * 0.08
        } else {
          coupling += (ratio - coupling) * 0.004
        }
        coupling = clamp(coupling, opts.kMin, opts.kMax)
      }
    } else {
      // Sin referencia: no se sabe qué parte es eco. Solo cuenta voz claramente alta mientras
      // el asistente (según eventos del servidor) habla; fuera de eso, el umbral normal.
      threshold = Math.max(opts.absMin, noiseFloor * opts.noiseMargin)
      if (playingHint) {
        threshold = Math.max(threshold, opts.absNoRef)
      }
    }

    const above = mic > threshold
    if (above) {
      sustain += dt
      lastAboveAt = now
    } else {
      sustain = Math.max(0, sustain - dt * 0.5)
    }

    let userVoiceStarted = false
    if (!confirmed && sustain >= opts.sustainMs) {
      confirmed = true
      userVoiceStarted = true
      confirmedRatioPeak = 0
    }
    if (confirmed) {
      const expected = Math.max(1e-6, coupling * refEnv)
      confirmedRatioPeak = Math.max(confirmedRatioPeak, mic / expected)
      if (now - lastAboveAt > opts.releaseMs) {
        confirmed = false
        sustain = 0
      }
    }

    return {
      playout,
      userVoice: confirmed,
      userVoiceStarted,
      threshold,
      coupling,
      noiseFloor,
    }
  }

  const reportFalsePositive = () => {
    // El «usuario» era el eco: el acoplamiento real es mayor. Se sube lo bastante para que
    // ese mismo nivel quede por debajo del umbral la próxima vez.
    const needed = (confirmedRatioPeak * coupling) / opts.echoMargin
    coupling = clamp(Math.max(coupling * 1.5, needed * 1.2), opts.kMin, opts.kMax)
  }

  return { push, reportFalsePositive, reset }
}
