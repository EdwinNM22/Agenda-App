import { config } from "../config.js"
import { nowNaiveDateTime, todayDate, tomorrowDate } from "../naiveDateTime.js"
import type { RealtimeVoice } from "../voices.js"
import { buildMainInstructions } from "./prompts/main.js"
import { CALL_INSTRUCTIONS } from "./prompts/call.js"
import { CHAT_PANEL_INSTRUCTIONS } from "./prompts/chat-panel.js"
import { TEXT_CHAT_INSTRUCTIONS } from "./prompts/text-chat.js"
import { TOOL_SILENT_CALL_NOTE, VOICE_INSTRUCTIONS } from "./prompts/voice.js"
import { REPORTS_INSTRUCTIONS } from "./prompts/reports.js"
import { SHARED_TOOLS } from "./tools/shared.tools.js"
import { ACTIVE_ASSISTANT_SYSTEMS } from "./systems/index.js"
import type { SessionContext } from "./types.js"

export type RealtimeSessionConfig = {
  type: "realtime"
  model: string
  instructions: string
  reasoning?: { effort: string }
  audio: {
    input: {
      noise_reduction: { type: string }
      transcription: { model: string; language?: string; prompt?: string }
      turn_detection: {
        type: string
        eagerness: string
        interrupt_response: boolean
        create_response: boolean
      }
    }
    output: { voice: RealtimeVoice }
  }
  tools: Array<{
    type: "function"
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  tool_choice: "auto"
}

/** Pista para el transcriptor: contexto y idiomas esperables. No es una instrucción para el asistente. */
const TRANSCRIPTION_PROMPT =
  "Conversación con un asistente de agenda, tareas, pagos y cobros. El usuario habla principalmente español; a veces inglés."

const buildSessionContext = (userName: string): SessionContext => ({
  userName,
  now: nowNaiveDateTime(),
  today: todayDate(),
  tomorrow: tomorrowDate(),
})

/** Reglas comunes a voz y texto: estilo, sistemas conectados, panel de chat y reportes. */
const buildSharedInstructions = (userName: string): string[] => {
  const ctx = buildSessionContext(userName)

  return [
    buildMainInstructions(ctx),
    ...ACTIVE_ASSISTANT_SYSTEMS.map((system) => system.instructions(ctx)),
    CALL_INSTRUCTIONS,
    CHAT_PANEL_INSTRUCTIONS,
    REPORTS_INSTRUCTIONS,
  ].flat()
}

/** Instrucciones de la sesión de voz (WebRTC): reglas comunes + modo voz. */
export const buildAssistantInstructions = (userName: string): string =>
  [...buildSharedInstructions(userName), ...VOICE_INSTRUCTIONS].join(" ")

/** Menos razonamiento = respuesta más directa y sin «pensar en voz alta» antes de cada tool. */
const reasoningConfig = (): { reasoning?: { effort: string } } =>
  config.openaiRealtimeReasoningEffort
    ? { reasoning: { effort: config.openaiRealtimeReasoningEffort } }
    : {}

export const buildAssistantTools = () =>
  [...ACTIVE_ASSISTANT_SYSTEMS.flatMap((system) => system.tools), ...SHARED_TOOLS].map((tool) => ({
    ...tool,
    description: `${tool.description}${TOOL_SILENT_CALL_NOTE}`,
  }))

/** Mismas reglas y tools que voz; cambia el modo de salida (escrito, sin audio). */
export const buildTextChatInstructions = (userName: string): string =>
  [...buildSharedInstructions(userName), ...TEXT_CHAT_INSTRUCTIONS].join(" ")

export type RealtimeTextClientSecretRequest = {
  session: {
    type: "realtime"
    model: string
    instructions: string
    reasoning?: { effort: string }
    output_modalities: ["text"]
    tools: ReturnType<typeof buildAssistantTools>
    tool_choice: "auto"
  }
}

export const buildRealtimeTextClientSecretRequest = (
  userName: string,
): RealtimeTextClientSecretRequest => ({
  session: {
    type: "realtime",
    model: config.openaiRealtimeModel,
    instructions: buildTextChatInstructions(userName),
    ...reasoningConfig(),
    output_modalities: ["text"],
    tools: buildAssistantTools(),
    tool_choice: "auto",
  },
})

export const buildRealtimeSession = (userName: string, voice: RealtimeVoice): RealtimeSessionConfig => ({
  type: "realtime",
  model: config.openaiRealtimeModel,
  instructions: buildAssistantInstructions(userName),
  ...reasoningConfig(),
  audio: {
    input: {
      noise_reduction: { type: "far_field" },
      transcription: {
        model: config.openaiRealtimeTranscriptionModel,
        // Sin `language` fijo (la app es multilingüe), pero la pista evita que un audio corto o
        // ruidoso se transcriba como hindi, inglés u otro idioma al azar.
        prompt: TRANSCRIPTION_PROMPT,
      },
      turn_detection: {
        type: "semantic_vad",
        eagerness: "low",
        interrupt_response: true,
        create_response: true,
      },
    },
    output: {
      voice,
    },
  },
  tools: buildAssistantTools(),
  tool_choice: "auto",
})
