/**
 * Mide qué dice el asistente de voz en un turno con tool, usando la sesión REAL
 * (prompt, tools, modelo, reasoning) por WebSocket con salida de audio.
 *
 *   npx tsx scripts/probe-preamble.ts [nuevo|anterior] [repeticiones] [audio|texto] [override]
 *
 * - "audio": sintetiza la frase con TTS y la envía como audio de entrada (como el micrófono);
 *   el VAD del servidor crea la respuesta. "texto": mensaje de texto + response.create.
 * - Tras la tool se envía un resultado simulado y el `response.create` del cliente (sin
 *   `instructions`). Con "override" se reproduce el comportamiento antiguo, que los sustituía.
 * - "anterior" reproduce la configuración previa (sin sección de preámbulos, sin nota en tools,
 *   sin reasoning) para poder comparar.
 *
 * Informa: PREÁMBULO = habló antes de llamar a la tool en la misma respuesta.
 */
import WebSocket from "ws"
import { buildRealtimeSession } from "../src/assistant/buildSession.js"
import { config } from "../src/config.js"

const variant = process.argv[2] === "anterior" ? "anterior" : "nuevo"
const runs = Number(process.argv[3] ?? 5)
const mode = process.argv[4] === "texto" ? "texto" : "audio"
// Por defecto reproduce el cliente actual (sin override). "override" reproduce el comportamiento antiguo.
const replyOverride = process.argv[5] === "override"

const prompts = [
  "¿Tengo tareas para hoy?",
  "Muéstrame la lista de pagos del día",
  "¿Qué tareas tengo para mañana?",
]
/** Lo que enviaba el cliente antes: `instructions` en el response.create sustituye a las de la sesión. */
const LEGACY_REPLY_OVERRIDE =
  "Speak your reply in the same language as the user's last spoken message in this call. Reply once, directly, using only the tool data. Your reply is spoken: one or two short natural sentences, key fact first."
const FAKE_RESULT: Record<string, unknown> = {
  list_tasks: { tasks: [], count: 0 },
  query_prestamo: { ok: true, resource: "pagos", rows: [], total: 0 },
}

const session = buildRealtimeSession("Alex", "marin") as unknown as Record<string, unknown>
if (variant === "anterior") {
  const OLD_VOICE =
    "MODO VOZ: tu respuesta se escucha. Una o dos frases cortas, conversacionales, empezando por el dato principal. Sin muletillas de arranque («bueno», «ok», «veamos», «mmm»)."
  const instructions = String(session.instructions)
  const cut = instructions.indexOf("# PREÁMBULOS (modo voz)")
  session.instructions = `${instructions.slice(0, cut)}${OLD_VOICE}`
  delete session.reasoning
  const note =
    " Llámala sin decir nada antes ni durante: no anuncies, narres ni confirmes la consulta; responde solo cuando tengas el resultado."
  session.tools = (session.tools as Array<{ description: string }>).map((tool) => ({
    ...tool,
    description: tool.description.replace(note, ""),
  }))
}
const { model: _model, ...update } = session

/** TTS → PCM16 24 kHz mono, el formato de entrada de Realtime. */
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
const audioCache = new Map<string, Buffer>()

type Result = {
  prompt: string
  tool: string | null
  /** Lo que dijo ANTES de llamar a la tool (misma respuesta). */
  preamble: string
  /** Lo que dijo en la respuesta posterior al resultado de la tool. */
  reply: string
}

const runOnce = (prompt: string, pcm: Buffer | null): Promise<Result> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${config.openaiRealtimeModel}`, {
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    })
    let preamble = ""
    let reply = ""
    let tool: string | null = null
    let callId = ""
    let phase: 1 | 2 = 1
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout"))
    }, 60_000)

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "session.update", session: update }))
    })
    ws.on("message", (raw) => {
      const event = JSON.parse(String(raw)) as Record<string, unknown> & { type: string }
      if (event.type === "error") {
        clearTimeout(timer)
        ws.close()
        reject(new Error(JSON.stringify(event.error)))
        return
      }
      if (event.type === "session.updated") {
        if (pcm) {
          // Voz + 2 s de silencio para que el VAD detecte el final del turno y responda solo.
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
      if (event.type === "response.output_audio_transcript.delta") {
        if (phase === 1) {
          preamble += String(event.delta ?? "")
        } else {
          reply += String(event.delta ?? "")
        }
      }
      if (event.type === "response.output_item.added") {
        const item = event.item as { type?: string; name?: string; call_id?: string } | undefined
        if (item?.type === "function_call" && phase === 1) {
          tool = item.name ?? "?"
          callId = item.call_id ?? ""
        }
      }
      if (event.type === "response.done") {
        if (phase === 1 && tool && callId) {
          // Igual que el cliente: resultado de la tool + response.create.
          phase = 2
          ws.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(FAKE_RESULT[tool] ?? { ok: true, tasks: [] }),
              },
            }),
          )
          ws.send(
            JSON.stringify({
              type: "response.create",
              response: replyOverride ? { instructions: LEGACY_REPLY_OVERRIDE } : {},
            }),
          )
          return
        }
        clearTimeout(timer)
        ws.close()
        resolve({ prompt, tool, preamble: preamble.trim(), reply: reply.trim() })
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
    `Variante: ${variant} | entrada: ${mode} | ${replyOverride ? "con" : "sin"} override | modelo: ${config.openaiRealtimeModel} | reasoning: ${session.reasoning ? JSON.stringify(session.reasoning) : "no enviado"}`,
  )
  let preambles = 0
  for (let i = 0; i < runs; i += 1) {
    const prompt = prompts[i % prompts.length] ?? prompts[0]!
    let pcm: Buffer | null = null
    if (mode === "audio") {
      pcm = audioCache.get(prompt) ?? (await synthesize(prompt))
      audioCache.set(prompt, pcm)
    }
    const result = await runOnce(prompt, pcm)
    if (result.preamble) {
      preambles += 1
    }
    console.log(
      `${result.preamble ? "PREÁMBULO" : "ok       "} tool=${result.tool ?? "-"} «${prompt}»${result.preamble ? `\n           antes de la tool: «${result.preamble}»` : ""}\n           respuesta: «${result.reply}»`,
    )
  }
  console.log(`\nTurnos con preámbulo hablado antes de la tool: ${preambles}/${runs}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
