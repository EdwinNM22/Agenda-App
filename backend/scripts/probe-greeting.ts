/**
 * Mide en qué idioma sale el saludo inicial (response.create con `instructions`, como el cliente).
 *
 *   npx tsx scripts/probe-greeting.ts [anterior|nuevo] [repeticiones]
 */
import WebSocket from "ws"
import { buildGreetingInstruction } from "../src/assistant/prompts/greeting.js"
import { buildRealtimeSession } from "../src/assistant/buildSession.js"
import { config } from "../src/config.js"

const variant = process.argv[2] === "anterior" ? "anterior" : "nuevo"
const runs = Number(process.argv[3] ?? 8)

const LEGACY =
  "Acaba de empezar la llamada. Saluda a Alex en una sola frase, cercana y breve. Preséntate como Isi. No listes funciones ni preguntes qué puede hacer. No sigas hablando después. Espera en silencio a que te hablen. Desde la primera frase del usuario responde en el idioma en que te hablen (inglés, español u otro). Nunca digas que no puedes hablar otro idioma."
const instruction = variant === "anterior" ? LEGACY : buildGreetingInstruction("Alex")

const { model: _model, ...update } = buildRealtimeSession("Alex", "marin") as unknown as Record<string, unknown>

const once = () =>
  new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${config.openaiRealtimeModel}`, {
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    })
    let said = ""
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout"))
    }, 30_000)
    ws.on("open", () => ws.send(JSON.stringify({ type: "session.update", session: update })))
    ws.on("message", (raw) => {
      const event = JSON.parse(String(raw)) as Record<string, unknown> & { type: string }
      if (event.type === "error") {
        clearTimeout(timer)
        ws.close()
        reject(new Error(JSON.stringify(event.error)))
      }
      if (event.type === "session.updated") {
        ws.send(JSON.stringify({ type: "response.create", response: { instructions: instruction } }))
      }
      if (event.type === "response.output_audio_transcript.delta") {
        said += String(event.delta ?? "")
      }
      if (event.type === "response.done") {
        clearTimeout(timer)
        ws.close()
        resolve(said.trim())
      }
    })
    ws.on("error", reject)
  })

const looksEnglish = (text: string) => /\b(hi|hello|nice|meet|you|i'm|i am|welcome)\b/i.test(text)

const main = async () => {
  console.log(`Saludo: ${variant}\n`)
  let english = 0
  const results = await Promise.all(Array.from({ length: runs }, () => once().catch((e) => `(error ${e.message})`)))
  for (const text of results) {
    const en = looksEnglish(text)
    if (en) {
      english += 1
    }
    console.log(`${en ? "INGLÉS " : "ok     "} «${text}»`)
  }
  console.log(`\nSaludos en inglés: ${english}/${runs}`)
}

void main()
