import { config } from "../config.js"
import { nowNaiveDateTime, todayDate, tomorrowDate } from "../naiveDateTime.js"
import type { RealtimeVoice } from "../voices.js"
import { buildMainInstructions } from "./prompts/main.js"
import { CALL_INSTRUCTIONS } from "./prompts/call.js"
import { CHAT_PANEL_INSTRUCTIONS } from "./prompts/chat-panel.js"
import { TEXT_CHAT_INSTRUCTIONS } from "./prompts/text-chat.js"
import { REPORTS_INSTRUCTIONS } from "./prompts/reports.js"
import { SHARED_TOOLS } from "./tools/shared.tools.js"
import { ACTIVE_ASSISTANT_SYSTEMS } from "./systems/index.js"
import type { SessionContext } from "./types.js"

export type RealtimeSessionConfig = {
  type: "realtime"
  model: string
  instructions: string
  audio: {
    input: {
      noise_reduction: { type: string }
      transcription: { model: string; language?: string }
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

const buildSessionContext = (userName: string): SessionContext => ({
  userName,
  now: nowNaiveDateTime(),
  today: todayDate(),
  tomorrow: tomorrowDate(),
})

export const buildAssistantInstructions = (userName: string): string => {
  const ctx = buildSessionContext(userName)

  const sections = [
    buildMainInstructions(ctx),
    ...ACTIVE_ASSISTANT_SYSTEMS.map((system) => system.instructions(ctx)),
    CALL_INSTRUCTIONS,
    CHAT_PANEL_INSTRUCTIONS,
    REPORTS_INSTRUCTIONS,
  ]

  return sections.flat().join(" ")
}

export const buildAssistantTools = () => [
  ...ACTIVE_ASSISTANT_SYSTEMS.flatMap((system) => system.tools),
  ...SHARED_TOOLS,
]

/** Mismas reglas y tools que voz; solo añade modo escrito (sin audio). */
export const buildTextChatInstructions = (userName: string): string =>
  [buildAssistantInstructions(userName), ...TEXT_CHAT_INSTRUCTIONS].join(" ")

export type RealtimeTextClientSecretRequest = {
  session: {
    type: "realtime"
    model: string
    instructions: string
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
    output_modalities: ["text"],
    tools: buildAssistantTools(),
    tool_choice: "auto",
  },
})

export const buildRealtimeSession = (userName: string, voice: RealtimeVoice): RealtimeSessionConfig => ({
  type: "realtime",
  model: config.openaiRealtimeModel,
  instructions: buildAssistantInstructions(userName),
  audio: {
    input: {
      noise_reduction: { type: "far_field" },
      transcription: {
        model: "whisper-1",
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
