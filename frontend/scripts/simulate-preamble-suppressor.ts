/**
 * Simula el supresor de preámbulos con frases reales capturadas de gpt-realtime-2.1-mini.
 *
 *   ../node_modules/.bin/esbuild scripts/simulate-preamble-suppressor.ts --bundle --platform=node \
 *     --format=cjs --alias:@=./src --outfile=/tmp/pre.cjs && node /tmp/pre.cjs
 */
import { createPreambleSuppressor } from "../src/audio/preambleSuppressor"

let failures = 0
const check = (ok: boolean, label: string) => {
  if (!ok) {
    failures += 1
  }
  console.log(`${ok ? "OK   " : "FALLO"} ${label}`)
}

type Harness = ReturnType<typeof makeHarness>
const makeHarness = () => {
  const timers: Array<{ at: number; run: () => void }> = []
  let clock = 0
  const state = { muted: false, clears: 0, muteCalls: [] as boolean[] }
  const suppressor = createPreambleSuppressor({
    setMuted: (muted) => {
      state.muted = muted
      state.muteCalls.push(muted)
    },
    clearOutput: () => {
      state.clears += 1
    },
    setTimer: (run, ms) => {
      const timer = { at: clock + ms, run }
      timers.push(timer)
      return timer
    },
    clearTimer: (handle) => {
      const index = timers.indexOf(handle as (typeof timers)[number])
      if (index >= 0) {
        timers.splice(index, 1)
      }
    },
  })
  const advance = (ms: number) => {
    clock += ms
    for (const timer of [...timers]) {
      if (timer.at <= clock) {
        timers.splice(timers.indexOf(timer), 1)
        timer.run()
      }
    }
  }
  const created = (id: string) => suppressor.handleEvent({ type: "response.created", response: { id } })
  const done = (id: string) => suppressor.handleEvent({ type: "response.done", response: { id } })
  /** Emite el texto en trozos de 2 caracteres (como los deltas del modelo). Devuelve en qué trozo se mutó. */
  const speak = (id: string, text: string): number => {
    let mutedAt = -1
    for (let i = 0; i < text.length; i += 2) {
      suppressor.handleEvent({
        type: "response.output_audio_transcript.delta",
        response_id: id,
        delta: text.slice(i, i + 2),
      })
      if (state.muted && mutedAt < 0) {
        mutedAt = i + 2
      }
    }
    return mutedAt
  }
  return { suppressor, state, advance, created, done, speak }
}

// 1) Preámbulos reales capturados → se cortan pronto y el audio vuelve con la respuesta posterior.
const PREAMBLES = [
  "Vale, déjame revisar la agenda para mañana.",
  "Déjame revisar los pagos de hoy y luego te cuento qué aparece en la lista.",
  "Déjame revisar qué tareas tienes para hoy.",
  "Claro, vamos a revisar las tareas agendadas para hoy.",
  "Voy a consultar los pagos del día.",
  "Un momento, reviso tus tareas.",
  "Let me check your tasks for today.",
]
for (const phrase of PREAMBLES) {
  const h: Harness = makeHarness()
  h.created("r1")
  const at = h.speak("r1", phrase)
  check(at > 0 && at < phrase.length, `preámbulo cortado a los ${at}/${phrase.length} caracteres: «${phrase}»`)
  check(h.state.clears === 1, "  vació el audio pendiente una vez")
  h.done("r1")
  h.advance(300) // la tool tarda poco
  h.created("r2") // respuesta posterior a la tool
  check(!h.state.muted, "  el audio vuelve en la respuesta posterior a la tool")
  h.speak("r2", "No tienes tareas para hoy.")
  check(!h.state.muted && h.state.clears === 1, "  la respuesta posterior se oye entera")
}

// 2) Respuestas legítimas (capturadas) y peticiones: nunca se silencian.
const LEGIT = [
  "No tienes tareas pendientes para hoy.",
  "Hoy no hay pagos registrados. En total, son cero.",
  "Tarea creada: reunión con Ana, mañana a las tres de la tarde.",
  "Tienes 8 pagos pendientes hoy.",
  "¿A qué hora quieres la reunión?",
  "No hay pagos de cuotas hoy.",
  "Claro que sí, tienes tres tareas.",
]
for (const phrase of LEGIT) {
  const h: Harness = makeHarness()
  h.created("r1")
  h.speak("r1", phrase)
  h.done("r1")
  h.advance(5000)
  check(!h.state.muted && h.state.muteCalls.length === 0 && h.state.clears === 0, `respuesta legítima intacta: «${phrase}»`)
}

// 3) Falso positivo (sin respuesta posterior): el silencio es acotado, nunca permanente.
{
  const h: Harness = makeHarness()
  h.created("r1")
  h.speak("r1", "Déjame ver, hoy tienes tres tareas pendientes.")
  check(h.state.muted, "falso positivo: se silencia")
  h.done("r1")
  h.advance(1000)
  check(h.state.muted, "  aún silenciado 1 s después de terminar")
  h.advance(600)
  check(!h.state.muted, "  se libera solo 1,5 s después de terminar (nunca queda mudo)")
}

// 4) Tool lenta: el silencio termina solo, y la siguiente respuesta se oye.
{
  const h: Harness = makeHarness()
  h.created("r1")
  h.speak("r1", "Déjame revisar qué tareas tienes.")
  h.done("r1")
  h.advance(4000) // la tool tarda 4 s
  check(!h.state.muted, "tool lenta: audio liberado antes del resultado")
  h.created("r2")
  h.speak("r2", "No tienes tareas.")
  check(!h.state.muted, "  y la respuesta posterior se oye")
}

// 5) Cada respuesta se evalúa por separado y reset() libera.
{
  const h: Harness = makeHarness()
  h.created("r1")
  h.speak("r1", "Déjame revisar tus tareas.")
  h.suppressor.reset()
  check(!h.state.muted, "reset() libera el audio (colgar / reconectar)")
  h.created("r2")
  h.speak("r2", "Listo.")
  check(h.state.clears === 1, "sin nuevo corte tras reset")
}

console.log(failures === 0 ? "\nTodos los escenarios OK" : `\n${failures} comprobaciones FALLARON`)
process.exit(failures === 0 ? 0 : 1)
