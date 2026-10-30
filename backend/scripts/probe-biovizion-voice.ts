/**
 * Compara el comportamiento del asistente con preguntas sobre BIO (Biovizion) dichas por VOZ
 * (audio sintetizado + VAD del servidor, como el micrófono) frente a escritas, usando la sesión
 * REAL de la app (prompt, tools, modelo). Tras la tool devuelve un resultado simulado solo para
 * comprobar que el modelo responde; no valida datos (eso lo hace el hub).
 *
 *   npx tsx scripts/probe-biovizion-voice.ts [audio|texto] [cliente|servidor] [repeticiones] [sistema]
 *
 * - "cliente": reproduce el `session.update` que envía `useRealtimeVoice.primeSession`
 *   (lo que realmente queda en la sesión de voz en producción). "servidor": solo la sesión base.
 * - sistema: biovizion (por defecto) | construction
 *
 * Informa por turno: transcripción oída, tool llamada (+ args) y respuesta final.
 */
import WebSocket from "ws"
import { buildRealtimeSession } from "../src/assistant/buildSession.js"
import { config } from "../src/config.js"

const mode = process.argv[2] === "texto" ? "texto" : "audio"
const clientPrime = process.argv[3] !== "servidor"
const runs = Number(process.argv[4] ?? 6)
const system = process.argv[5] === "construction" ? "construction" : "biovizion"

const PROMPTS: Record<string, string[]> = {
  biovizion: [
    "¿Qué hay en Biovizion hoy?",
    "¿Quién está en un proyecto ahora mismo?",
    "¿Cuántas horas trabajó Juan esta semana?",
    "¿Qué hay en BIO hoy?",
    "Dime los proyectos de Bio Visión de esta semana.",
    "¿Tengo citas de representantes mañana en Biovizion?",
  ],
  construction: [
    "¿Cuánto hay en caja chica de EC Construction?",
    "¿Quién asistió hoy en construcción?",
    "¿Qué egresos tuvo construction este mes?",
    "¿Qué proyectos activos tiene EC Construction?",
  ],
}

const expectedTool = system === "construction" ? "query_construction" : "query_biovizion"
const prompts = PROMPTS[system]!

const session = buildRealtimeSession("Alex", "marin") as unknown as Record<string, unknown>
const { model: _model, ...baseUpdate } = session

/** Lo que `useRealtimeVoice.primeSession` + `voiceGuard.syncTurnDetection` mandan tras conectar. */
const CLIENT_PRIME = {
  audio: { input: { transcription: { model: "whisper-1" } } },
}

const synthesize = async (text: string): Promise<Buffer> => {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "ash", input: text, response_format: "pcm" }),
  })
  if (!response.ok) {
    throw new Error(`TTS ${response.status}: ${(await response.text()).slice(0, 200)}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

type Result = {
  prompt: string
  heard: string
  tool: string | null
  args: string
  preamble: string
  reply: string
  errors: string[]
  transcriptionModel: string
}

const runOnce = (prompt: string, pcm: Buffer | null): Promise<Result> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${config.openaiRealtimeModel}`, {
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    })
    const result: Result = {
      prompt,
      heard: "",
      tool: null,
      args: "",
      preamble: "",
      reply: "",
      errors: [],
      transcriptionModel: "",
    }
    let callId = ""
    let phase: 1 | 2 = 1
    let updates = 0
    let started = false
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout"))
    }, 60_000)

    const startTurn = () => {
      if (started) {
        return
      }
      started = true
      if (pcm) {
        const all = Buffer.concat([pcm, Buffer.alloc(24_000 * 2 * 2)])
        const chunk = 24_000 * 2 * 0.2
        for (let offset = 0; offset < all.length; offset += chunk) {
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: all.subarray(offset, offset + chunk).toString("base64"),
            }),
          )
        }
      } else {
        ws.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] },
          }),
        )
        ws.send(JSON.stringify({ type: "response.create" }))
      }
    }

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "session.update", session: baseUpdate }))
    })
    ws.on("message", (raw) => {
      const event = JSON.parse(String(raw)) as Record<string, unknown> & { type: string }
      if (event.type === "error") {
        result.errors.push(JSON.stringify(event.error))
        if (!started && clientPrime) {
          // El cliente real ignora este error; seguimos para ver el efecto en la sesión.
          startTurn()
        }
        return
      }
      if (event.type === "session.updated") {
        updates += 1
        const audio = (event.session as { audio?: { input?: { transcription?: { model?: string } } } })?.audio
        result.transcriptionModel = audio?.input?.transcription?.model ?? ""
        if (updates === 1 && clientPrime && mode === "audio") {
          ws.send(JSON.stringify({ type: "session.update", session: CLIENT_PRIME }))
          return
        }
        startTurn()
      }
      if (event.type === "conversation.item.input_audio_transcription.completed") {
        result.heard = String(event.transcript ?? "").trim()
      }
      if (event.type === "response.output_audio_transcript.delta" || event.type === "response.output_text.delta") {
        if (phase === 1) {
          result.preamble += String(event.delta ?? "")
        } else {
          result.reply += String(event.delta ?? "")
        }
      }
      if (event.type === "response.output_item.added") {
        const item = event.item as { type?: string; name?: string; call_id?: string } | undefined
        if (item?.type === "function_call" && phase === 1) {
          result.tool = item.name ?? "?"
          callId = item.call_id ?? ""
        }
      }
      if (event.type === "response.output_item.done") {
        const item = event.item as { type?: string; arguments?: string } | undefined
        if (item?.type === "function_call" && phase === 1) {
          result.args = item.arguments ?? ""
        }
      }
      if (event.type === "response.done") {
        if (phase === 1 && result.tool && callId) {
          phase = 2
          ws.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify({
                  ok: true,
                  resource: "resumen",
                  data: { fechaInicio: "2026-10-29", fechaFin: "2026-10-29", proyectosHoy: 2, personasConPushInActivo: 3 },
                }),
              },
            }),
          )
          ws.send(JSON.stringify({ type: "response.create" }))
          return
        }
        clearTimeout(timer)
        ws.close()
        resolve(result)
      }
    })
    ws.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })

const main = async () => {
  if (!config.openaiApiKey) {
    throw new Error("Falta OPENAI_API_KEY")
  }
  console.log(
    `Entrada: ${mode} | sesión: ${clientPrime ? "con session.update del cliente" : "solo servidor"} | sistema: ${system} | modelo: ${config.openaiRealtimeModel}`,
  )
  let ok = 0
  for (let i = 0; i < runs; i += 1) {
    const prompt = prompts[i % prompts.length]!
    const pcm = mode === "audio" ? await synthesize(prompt) : null
    const r = await runOnce(prompt, pcm).catch((error) => ({
      prompt,
      heard: "",
      tool: null,
      args: "",
      preamble: "",
      reply: "",
      errors: [String(error.message ?? error)],
      transcriptionModel: "",
    }))
    const called = r.tool === expectedTool
    if (called) {
      ok += 1
    }
    console.log(
      `${called ? "OK  " : "FALLA"} «${prompt}»\n      oyó: «${r.heard || "(texto)"}» | transcripción: ${r.transcriptionModel || "?"}\n      tool: ${r.tool ?? "(ninguna)"} ${r.args}\n      respuesta: «${(r.reply || r.preamble).trim().slice(0, 160)}»${r.errors.length ? `\n      errores: ${r.errors.join(" | ")}` : ""}`,
    )
  }
  console.log(`\nLlamó a ${expectedTool}: ${ok}/${runs}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
