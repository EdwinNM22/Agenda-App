import { config } from "./config.js"
import { DEFAULT_VOICE, isRealtimeVoice, type RealtimeVoice } from "./voices.js"

const previewCache = new Map<string, Buffer>()
const inflight = new Map<string, Promise<Buffer>>()

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "ahí"

const cacheKey = (voice: RealtimeVoice, name: string) =>
  `${voice}:${firstName(name).toLocaleLowerCase("es")}`

const synthesizePreview = async (voice: RealtimeVoice, name: string) => {
  const openaiResponse = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: `Hola ${firstName(name)}, ¿en qué te puedo ayudar hoy?`,
      instructions: "Habla en español, cercano, natural y breve. Suena como un saludo de asistente.",
    }),
  })

  if (!openaiResponse.ok) {
    const payload = await openaiResponse.text()
    throw new Error(payload || "OpenAI TTS rechazó la preescucha")
  }

  return Buffer.from(await openaiResponse.arrayBuffer())
}

export const getVoicePreview = async (voiceInput: string, name: string) => {
  const voice: RealtimeVoice = isRealtimeVoice(voiceInput) ? voiceInput : DEFAULT_VOICE
  const key = cacheKey(voice, name)
  const cached = previewCache.get(key)
  if (cached) {
    return cached
  }

  const pending = inflight.get(key)
  if (pending) {
    return pending
  }

  const task = synthesizePreview(voice, name)
    .then((audio) => {
      previewCache.set(key, audio)
      inflight.delete(key)
      return audio
    })
    .catch((error) => {
      inflight.delete(key)
      throw error
    })

  inflight.set(key, task)
  return task
}
