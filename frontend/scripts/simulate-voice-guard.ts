/**
 * Simula la secuencia de eventos (servidor Realtime + monitor de audio) contra `voiceGuard`
 * para verificar los escenarios de eco/interrupción sin micrófono ni red.
 *
 *   npx esbuild scripts/simulate-voice-guard.ts --bundle --platform=node --format=cjs \
 *     --outfile=/tmp/sim-voice-guard.cjs && node /tmp/sim-voice-guard.cjs
 */
import { createVoiceGuard } from "../src/audio/voiceGuard"
import type { EchoMonitor, EchoMonitorState } from "../src/audio/echoMonitor"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const baseState: EchoMonitorState = {
  playout: false,
  userVoice: false,
  userVoiceStarted: false,
  threshold: 0.01,
  coupling: 0.1,
  noiseFloor: 0.004,
  healthy: true,
  refReliable: true,
  micLevel: 0,
  refLevel: 0,
}

const ASSISTANT_TEXT =
  "Tarea creada: reunión con Ana mañana a las tres de la tarde. Además tienes dos pagos pendientes para hoy."

const makeRig = () => {
  const sent: Array<Record<string, unknown>> = []
  const hearing: boolean[] = []
  const logs: string[] = []
  let falsePositives = 0
  let listener: ((s: EchoMonitorState, now: number) => void) | null = null
  let hint = false
  let state = { ...baseState }

  const monitor: EchoMonitor = {
    get state() {
      return state
    },
    subscribe: (fn) => {
      listener = fn
      return () => {
        listener = null
      }
    },
    setPlayingHint: (playing) => {
      hint = playing
    },
    setMicStream: () => undefined,
    reportFalsePositive: () => {
      falsePositives += 1
    },
    destroy: () => undefined,
  }

  const guard = createVoiceGuard({
    send: (payload) => {
      sent.push(payload as Record<string, unknown>)
      return true
    },
    log: (label, extra) => logs.push(extra ? `${label} ${JSON.stringify(extra)}` : label),
    onHearingUser: (active) => hearing.push(active),
  })
  guard.attachMonitor(monitor)
  guard.setTurnTaking(true)

  return {
    sent,
    hearing,
    logs,
    guard,
    falsePositives: () => falsePositives,
    hint: () => hint,
    tick: (patch: Partial<EchoMonitorState> = {}) => {
      state = { ...baseState, ...patch }
      listener?.(state, performance.now())
    },
    event: (event: Record<string, unknown>) => guard.handleEvent(event),
    turns: () =>
      sent
        .filter((e) => e.type === "session.update")
        .map((e) => {
          const td = (e.session as any).audio.input.turn_detection
          return { create: td.create_response as boolean, interrupt: td.interrupt_response as boolean }
        }),
    lastTurn() {
      const turns = this.turns()
      return turns[turns.length - 1]
    },
    count: (type: string) => sent.filter((e) => e.type === type).length,
  }
}

/** El asistente empieza a hablar: respuesta + audio + referencia remota con señal. */
const assistantStarts = (rig: ReturnType<typeof makeRig>, responseId = "r1") => {
  rig.event({ type: "response.created", response: { id: responseId } })
  rig.event({ type: "response.output_audio.delta", response_id: responseId })
  rig.event({ type: "output_audio_buffer.started" })
  rig.event({ type: "response.output_audio_transcript.done", response_id: responseId, transcript: ASSISTANT_TEXT })
  rig.event({ type: "response.done", response: { id: responseId } })
  rig.tick({ playout: true, refLevel: 0.1 })
}

const assistantStops = (rig: ReturnType<typeof makeRig>) => {
  rig.event({ type: "output_audio_buffer.stopped" })
  rig.tick({ playout: false, refLevel: 0 })
}

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) {
    failures += 1
  }
  console.log(`  ${ok ? "OK   " : "FALLO"} ${label}${detail ? `  (${detail})` : ""}`)
}

const run = async () => {
  console.log("1) Altavoz: el eco transcrito NO genera petición, interrupción ni mensaje")
  {
    const rig = makeRig()
    rig.tick()
    check("antes de hablar: servidor puede crear respuesta e interrumpe el cliente", rig.lastTurn()?.create === true && rig.lastTurn()?.interrupt === false)
    assistantStarts(rig)
    check("mientras suena: create_response=false", rig.lastTurn()?.create === false)
    check("mientras suena: el servidor ya no interrumpe (lo decide el cliente)", rig.lastTurn()?.interrupt === false)
    // el servidor detecta eco como voz; el detector local NO lo confirma
    rig.event({ type: "input_audio_buffer.speech_started", item_id: "echo1" })
    check("eco no se marca como «usuario hablando»", rig.hearing.at(-1) !== true)
    rig.tick({ playout: true, refLevel: 0.1 })
    rig.event({ type: "input_audio_buffer.speech_stopped", item_id: "echo1" })
    const verdict = rig.guard.judgeTranscript("echo1", "reunión con Ana mañana a las tres de la tarde")
    check("transcripción de eco descartada", verdict === "echo")
    check("el eco se borra del contexto del modelo", rig.sent.some((e) => e.type === "conversation.item.delete" && e.item_id === "echo1"))
    check("no se canceló la respuesta", rig.count("response.cancel") === 0)
    check("no se creó ninguna respuesta", rig.count("response.create") === 0)
    assistantStops(rig)
    check("al terminar, vuelven las respuestas automáticas", rig.lastTurn()?.create === true)
  }

  console.log("2) Interrupción voluntaria: hablar mientras el asistente responde")
  {
    const rig = makeRig()
    rig.tick()
    assistantStarts(rig)
    rig.tick({ playout: true, refLevel: 0.1, userVoice: true, userVoiceStarted: true })
    check("se vacía el audio pendiente", rig.count("output_audio_buffer.clear") === 1)
    check("la respuesta ya había terminado de generarse: no hace falta cancelarla", rig.count("response.cancel") === 0)
    check("se reabre la creación de respuesta para lo que dijo el usuario", rig.lastTurn()?.create === true)
    rig.event({ type: "input_audio_buffer.speech_started", item_id: "u1" })
    check("sí se marca «usuario hablando»", rig.hearing.at(-1) === true)
    rig.event({ type: "input_audio_buffer.speech_stopped", item_id: "u1" })
    check("su petición se acepta", rig.guard.judgeTranscript("u1", "no espera mejor muéstrame los cobros") === "accept")
  }

  console.log("2b) Interrupción mientras el modelo aún está generando la respuesta")
  {
    const rig = makeRig()
    rig.tick()
    rig.event({ type: "response.created", response: { id: "g1" } })
    rig.event({ type: "response.output_audio.delta", response_id: "g1" })
    rig.event({ type: "output_audio_buffer.started" })
    rig.tick({ playout: true, refLevel: 0.1, userVoice: true, userVoiceStarted: true })
    check("se cancela la respuesta en curso", rig.count("response.cancel") === 1)
    check("se vacía el audio", rig.count("output_audio_buffer.clear") === 1)
  }

  console.log("3) Voz baja encima del asistente (no confirmada) pero NO es eco: no se pierde")
  {
    const rig = makeRig()
    rig.tick()
    assistantStarts(rig)
    rig.event({ type: "input_audio_buffer.speech_started", item_id: "q1" })
    rig.tick({ playout: true, refLevel: 0.1 })
    rig.event({ type: "input_audio_buffer.speech_stopped", item_id: "q1" })
    check("se acepta", rig.guard.judgeTranscript("q1", "oye y cuánto hay en caja chica") === "accept")
    check("queda en espera mientras el asistente habla", rig.guard.hasDeferredRequest() === true && rig.count("response.create") === 0)
    assistantStops(rig)
    check("al terminar el asistente se atiende sola", rig.count("response.create") === 1 && rig.guard.hasDeferredRequest() === false)
  }

  console.log("4) Auriculares / turno normal sin solapamiento")
  {
    const rig = makeRig()
    rig.tick()
    assistantStarts(rig)
    assistantStops(rig)
    await wait(520)
    rig.tick()
    rig.event({ type: "input_audio_buffer.speech_started", item_id: "n1" })
    check("se marca «usuario hablando»", rig.hearing.at(-1) === true)
    rig.event({ type: "input_audio_buffer.speech_stopped", item_id: "n1" })
    check("el servidor puede crear la respuesta nativamente", rig.lastTurn()?.create === true)
    check("respuesta corta idéntica a una frase del asistente se acepta", rig.guard.judgeTranscript("n1", "mañana a las tres de la tarde") === "accept")
    check("no hay respuesta forzada", rig.count("response.create") === 0)
  }

  console.log("5) Varias solicitudes consecutivas")
  {
    const rig = makeRig()
    rig.tick()
    let accepted = 0
    for (let i = 1; i <= 4; i += 1) {
      assistantStarts(rig, `r${i}`)
      assistantStops(rig)
      await wait(520)
      rig.tick()
      rig.event({ type: "input_audio_buffer.speech_started", item_id: `c${i}` })
      rig.event({ type: "input_audio_buffer.speech_stopped", item_id: `c${i}` })
      if (rig.guard.judgeTranscript(`c${i}`, `consulta número ${i} sobre pagos`) === "accept") {
        accepted += 1
      }
    }
    check("las 4 solicitudes se aceptan", accepted === 4)
    check("sin cancelaciones ni borrados espurios", rig.count("response.cancel") === 0 && rig.count("conversation.item.delete") === 0)
  }

  console.log("6) El corte lo causó el eco: se corrige el umbral")
  {
    const rig = makeRig()
    rig.tick()
    assistantStarts(rig)
    rig.tick({ playout: true, refLevel: 0.1, userVoice: true, userVoiceStarted: true })
    rig.event({ type: "input_audio_buffer.speech_started", item_id: "f1" })
    rig.event({ type: "input_audio_buffer.speech_stopped", item_id: "f1" })
    const verdict = rig.guard.judgeTranscript("f1", "reunión con Ana mañana a las tres de la tarde")
    check("transcripción descartada", verdict === "echo")
    check("el detector aprende (sube el acoplamiento)", rig.falsePositives() === 1)
  }

  console.log("7) Degradación: sin análisis fiable vuelve al comportamiento nativo")
  {
    const rig = makeRig()
    rig.tick()
    check("modo gestionado: el cliente interrumpe", rig.lastTurn()?.interrupt === false)
    rig.tick({ healthy: false })
    await wait(1100)
    rig.tick({ healthy: false })
    check("tras perder fiabilidad: interrupción nativa del servidor", rig.lastTurn()?.interrupt === true && rig.lastTurn()?.create === true)
    rig.tick()
    check("al recuperarse vuelve al modo gestionado", rig.lastTurn()?.interrupt === false)
  }

  console.log("8) Degradación: sin referencia remota ni eventos de reproducción (p. ej. iOS)")
  {
    const rig = makeRig()
    rig.tick()
    rig.event({ type: "response.created", response: { id: "x" } })
    rig.event({ type: "response.output_audio.delta", response_id: "x" })
    rig.event({ type: "response.done", response: { id: "x" } })
    rig.tick({ refReliable: false })
    await wait(1100)
    rig.tick({ refReliable: false })
    check("no se puede saber cuándo suena: interrupción nativa", rig.lastTurn()?.interrupt === true)
  }

  console.log("9) Saludo inicial: sin respuestas automáticas hasta que termine")
  {
    const rig = makeRig()
    rig.guard.setTurnTaking(false)
    rig.tick()
    check("durante el saludo create_response=false", rig.lastTurn()?.create === false)
    rig.guard.setTurnTaking(true)
    check("tras el saludo se abre el turno", rig.lastTurn()?.create === true)
  }

  console.log(failures === 0 ? "\nTodos los escenarios OK" : `\n${failures} comprobación(es) FALLARON`)
  process.exit(failures === 0 ? 0 : 1)
}

void run()
