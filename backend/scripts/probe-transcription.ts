/**
 * Compara configuraciones de transcripción de entrada de Realtime con frases cortas en español
 * (y algunas en inglés), limpias y con ruido, y detecta transcripciones en otro alfabeto/idioma.
 *
 *   npx tsx scripts/probe-transcription.ts [repeticiones]
 */
import WebSocket from "ws"
import { config } from "../src/config.js"

const PROMPT =
  "Conversación con un asistente de agenda y finanzas. El usuario habla principalmente español; a veces inglés."

type Variant = { name: string; transcription: Record<string, unknown> }
const VARIANTS: Variant[] = [
  { name: "whisper-1 (actual)", transcription: { model: "whisper-1" } },
  { name: "whisper-1 + prompt", transcription: { model: "whisper-1", prompt: PROMPT } },
  { name: "whisper-1 + language=es", transcription: { model: "whisper-1", language: "es" } },
  { name: "gpt-4o-mini-transcribe + prompt", transcription: { model: "gpt-4o-mini-transcribe", prompt: PROMPT } },
  { name: "gpt-4o-transcribe + prompt", transcription: { model: "gpt-4o-transcribe", prompt: PROMPT } },
]

const PHRASES: Array<{ text: string; lang: "es" | "en" }> = [
  { text: "Hola, Isi.", lang: "es" },
  { text: "¿Tengo tareas para hoy?", lang: "es" },
  { text: "Muéstrame la lista de pagos del día.", lang: "es" },
  { text: "Sí, adelante.", lang: "es" },
  { text: "Cancela esa tarea.", lang: "es" },
  { text: "¿Cuánto hay en caja chica?", lang: "es" },
  { text: "What tasks do I have today?", lang: "en" },
  { text: "Hi Isi, how are you?", lang: "en" },
]

const synthesize = async (text: string, voice: string): Promise<Buffer> => {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, input: text, response_format: "pcm" }),
  })
  if (!response.ok) {
    throw new Error(`TTS ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

/** Mezcla ruido gaussiano al SNR indicado (dB) para parecerse a un micrófono de móvil. */
const addNoise = (pcm: Buffer, snrDb: number): Buffer => {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2))
  let energy = 0
  for (const sample of samples) {
    energy += sample * sample
  }
  const rms = Math.sqrt(energy / Math.max(1, samples.length))
  const sigma = rms / 10 ** (snrDb / 20)
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    const gauss = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random())
    out[i] = Math.max(-32768, Math.min(32767, (samples[i] ?? 0) + gauss * sigma))
  }
  return Buffer.from(out.buffer)
}

const transcribe = (variant: Variant, pcm: Buffer): Promise<string> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${config.openaiRealtimeModel}`, {
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    })
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout"))
    }, 30_000)
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            audio: {
              input: {
                noise_reduction: { type: "far_field" },
                transcription: variant.transcription,
                turn_detection: { type: "server_vad", create_response: false, interrupt_response: false },
              },
            },
          },
        }),
      )
    })
    ws.on("message", (raw) => {
      const event = JSON.parse(String(raw)) as Record<string, unknown> & { type: string }
      if (event.type === "error") {
        clearTimeout(timer)
        ws.close()
        reject(new Error(JSON.stringify(event.error)))
      }
      if (event.type === "session.updated") {
        const all = Buffer.concat([Buffer.alloc(24_000 * 2 * 0.4), pcm, Buffer.alloc(24_000 * 2 * 1.5)])
        const chunk = 24_000 * 2 * 0.2
        for (let offset = 0; offset < all.length; offset += chunk) {
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: all.subarray(offset, offset + chunk).toString("base64"),
            }),
          )
        }
      }
      if (event.type === "conversation.item.input_audio_transcription.completed") {
        clearTimeout(timer)
        ws.close()
        resolve(String(event.transcript ?? "").trim())
      }
      if (event.type === "conversation.item.input_audio_transcription.failed") {
        clearTimeout(timer)
        ws.close()
        resolve("(falló)")
      }
    })
    ws.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })

/** Caracteres fuera de latín (hindi, árabe, CJK, cirílico…) = idioma equivocado. */
const looksWrongScript = (text: string): boolean => /[^\u0000-\u024F\u1E00-\u1EFF\s\p{P}\p{S}\p{N}]/u.test(text)

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const main = async () => {
  const reps = Number(process.argv[2] ?? 2)
  const voices = ["ash", "nova"]
  const clips: Array<{ text: string; lang: string; pcm: Buffer; label: string }> = []
  const hard = process.argv[3] === "duro"
  for (const phrase of PHRASES) {
    for (let r = 0; r < reps; r += 1) {
      const clean = await synthesize(phrase.text, voices[r % voices.length] ?? "ash")
      if (hard) {
        // Caso duro: volumen bajo (-24 dB), mucho ruido (0 dB de SNR) y trozos recortados.
        const quiet = Buffer.from(
          Int16Array.from(new Int16Array(clean.buffer, clean.byteOffset, clean.length / 2), (v) => v * 0.063).buffer,
        )
        const cut = quiet.subarray(0, Math.max(9_600, Math.floor((quiet.length * (0.35 + 0.15 * r)) / 2) * 2))
        clips.push({ ...phrase, pcm: addNoise(quiet, 3), label: "bajo+ruido 3 dB" })
        clips.push({ ...phrase, pcm: addNoise(cut, 6), label: "recortado+ruido" })
        continue
      }
      clips.push({ ...phrase, pcm: clean, label: "limpio" })
      clips.push({ ...phrase, pcm: addNoise(clean, 6), label: "ruido 6 dB" })
    }
  }
  console.log(`${clips.length} clips por variante\n`)

  const summary: Array<{ name: string; wrongScript: number; exact: number; total: number; wrongLang: number }> = []
  await Promise.all(
    VARIANTS.map(async (variant) => {
      let wrongScript = 0
      let exact = 0
      let wrongLang = 0
      const bad: string[] = []
      for (const clip of clips) {
        const heard = await transcribe(variant, clip.pcm).catch((error) => `(error ${error.message})`)
        const script = looksWrongScript(heard)
        const same = normalize(heard) === normalize(clip.text)
        // En el caso duro el texto exacto no es el objetivo: solo idioma/alfabeto correctos.
        // Español dicho que sale como inglés (u otro) también cuenta como idioma equivocado.
        const spanishToEnglish = clip.lang === "es" && /\b(the|what|tasks|hello|hi|you|how)\b/i.test(heard)
        if (script) {
          wrongScript += 1
        }
        if (spanishToEnglish) {
          wrongLang += 1
        }
        if (same) {
          exact += 1
        }
        if (script || spanishToEnglish) {
          bad.push(`   «${clip.text}» (${clip.label}) → «${heard}»`)
        }
      }
      summary.push({ name: variant.name, wrongScript, exact, total: clips.length, wrongLang })
      if (bad.length) {
        console.log(`[${variant.name}] idioma/alfabeto equivocado:\n${bad.slice(0, 6).join("\n")}\n`)
      }
    }),
  )
  console.log("Variante                           otro alfabeto | es→otro idioma | texto exacto")
  for (const item of VARIANTS.map((v) => summary.find((s) => s.name === v.name)!)) {
    console.log(
      `${item.name.padEnd(34)} ${String(item.wrongScript).padStart(5)}/${item.total}      ${String(item.wrongLang).padStart(5)}/${item.total}        ${String(item.exact).padStart(3)}/${item.total}`,
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
