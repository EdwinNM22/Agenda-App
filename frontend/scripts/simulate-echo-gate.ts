/**
 * Simulación offline del detector de voz real vs. eco (src/audio/echoGate.ts).
 *
 *   npx esbuild scripts/simulate-echo-gate.ts --bundle --platform=node --format=cjs \
 *     --outfile=/tmp/sim-echo-gate.cjs && node /tmp/sim-echo-gate.cjs
 *
 * Genera niveles RMS sintéticos (envolvente silábica) para el audio remoto y el micrófono:
 * eco con retardo y acoplamiento variable, ráfagas de «AEC aún convergiendo», cambios de
 * volumen y voz del usuario por encima. No sustituye la prueba en dispositivos reales, pero
 * permite recalibrar umbrales sin salir del editor.
 */
import { createEchoGate } from "../src/audio/echoGate"

const TICK = 30

const rng = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** Envolvente de voz: sílabas a ~4 Hz con pausas entre palabras. */
const makeSpeechEnv = (seed: number, durationMs: number) => {
  const rand = rng(seed)
  const phase = rand() * 6.28
  const pauses: Array<[number, number]> = []
  for (let t = 400 + rand() * 600; t < durationMs; t += 900 + rand() * 900) {
    pauses.push([t, t + 120 + rand() * 220])
  }
  return (tMs: number) => {
    if (pauses.some(([a, b]) => tMs >= a && tMs <= b)) {
      return 0.03
    }
    const syl = Math.max(0, Math.sin(2 * Math.PI * 4 * (tMs / 1000) + phase))
    return 0.25 + 0.75 * syl
  }
}

type Scenario = {
  coupling: number
  delayMs: number
  userRms: number
  /** Cambio de volumen (multiplica el acoplamiento) a mitad de la respuesta. */
  volumeJump?: number
  /** Ráfaga de eco al inicio (AEC sin converger). */
  startBurst?: number
  assistantFrom: number
  assistantTo: number
  userFrom: number
  userTo: number
  total: number
}

type Result = { falseFrames: number; falseOnsetsBeforeUser: number; detectLatency: number | null }

const run = (sc: Scenario, seed: number, ignoreFirstMs = 0): Result => {
  const rand = rng(seed)
  const refEnv = makeSpeechEnv(seed * 7 + 1, sc.total)
  const userEnv = makeSpeechEnv(seed * 13 + 5, sc.total)
  const gate = createEchoGate()
  const refAt = (t: number) =>
    t >= sc.assistantFrom && t <= sc.assistantTo ? 0.12 * refEnv(t) : 0

  let falseFrames = 0
  let falseOnsetsBeforeUser = 0
  let detectLatency: number | null = null

  for (let t = TICK; t <= sc.total; t += TICK) {
    const ref = refAt(t) * (0.9 + 0.2 * rand())
    let coupling = sc.coupling
    if (sc.volumeJump && t > (sc.assistantFrom + sc.assistantTo) / 2) {
      coupling *= sc.volumeJump
    }
    let burst = 1
    if (sc.startBurst && t < sc.assistantFrom + 400) {
      burst = sc.startBurst
    }
    const echo = coupling * burst * refAt(t - sc.delayMs) * (0.6 + 0.8 * rand())
    const user = t >= sc.userFrom && t <= sc.userTo ? sc.userRms * userEnv(t) : 0
    const noise = 0.003 * (0.5 + rand())
    const mic = Math.sqrt(echo * echo + user * user + noise * noise)

    const state = gate.push({ now: t + 1000, mic, ref })
    const userActive = user > 0
    if (state.userVoiceStarted) {
      if (!userActive && t > ignoreFirstMs) {
        falseOnsetsBeforeUser += 1
      }
      if (userActive && detectLatency === null) {
        detectLatency = t - sc.userFrom
      }
    }
    if (state.userVoice && !userActive && t > ignoreFirstMs) {
      falseFrames += 1
    }
  }
  return { falseFrames, falseOnsetsBeforeUser, detectLatency }
}

const base: Scenario = {
  coupling: 0,
  delayMs: 90,
  userRms: 0,
  assistantFrom: 1000,
  assistantTo: 9000,
  userFrom: 99999,
  userTo: 99999,
  total: 11000,
}

const SEEDS = 200
const pct = (n: number) => `${((100 * n) / SEEDS).toFixed(1).padStart(5)}%`

console.log("=== A. Solo eco (el usuario NO habla): runs con al menos 1 falsa detección ===")
console.log("acoplamiento = RMS de eco / RMS remoto (0 = auriculares, 0.5 = altavoz casi sin AEC)")
for (const coupling of [0, 0.03, 0.08, 0.15, 0.3, 0.5]) {
  for (const [label, extra] of [
    ["estable", {}],
    ["ráfaga AEC ×3 al inicio", { startBurst: 3 }],
    ["subida de volumen ×2", { volumeJump: 2 }],
  ] as const) {
    let bad = 0
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const r = run({ ...base, coupling, ...extra }, seed)
      if (r.falseOnsetsBeforeUser > 0) {
        bad += 1
      }
    }
    console.log(`  k=${coupling.toFixed(2)}  ${label.padEnd(24)} falsos positivos: ${pct(bad)}`)
  }
}

console.log("\n=== B. El usuario interrumpe a mitad de la respuesta (4.0–6.0 s) ===")
console.log("userRms = nivel RMS medio de la voz del usuario en el micrófono")
for (const coupling of [0, 0.08, 0.15, 0.3]) {
  for (const userRms of [0.02, 0.04, 0.08, 0.16]) {
    let detected = 0
    let latencySum = 0
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const r = run({ ...base, coupling, userRms, userFrom: 4000, userTo: 6000 }, seed)
      if (r.detectLatency !== null) {
        detected += 1
        latencySum += r.detectLatency
      }
    }
    const avg = detected > 0 ? Math.round(latencySum / detected) : 0
    console.log(
      `  k=${coupling.toFixed(2)} voz=${userRms.toFixed(2)}  detectada ${pct(detected)}  latencia media ${String(avg).padStart(4)} ms`,
    )
  }
}

console.log("\n=== C. El usuario habla con el asistente en silencio (sin referencia) ===")
for (const userRms of [0.015, 0.03, 0.06]) {
  let detected = 0
  let latencySum = 0
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const r = run(
      { ...base, coupling: 0.15, userRms, assistantFrom: 1000, assistantTo: 3000, userFrom: 6000, userTo: 8000 },
      seed,
    )
    if (r.detectLatency !== null) {
      detected += 1
      latencySum += r.detectLatency
    }
  }
  console.log(
    `  voz=${userRms.toFixed(3)}  detectada ${pct(detected)}  latencia media ${String(detected ? Math.round(latencySum / detected) : 0).padStart(4)} ms`,
  )
}
