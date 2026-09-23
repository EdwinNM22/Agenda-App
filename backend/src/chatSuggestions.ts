import { config } from "./config.js"
import {
  buildChatSuggestionsUserMessage,
  CHAT_SUGGESTIONS_SYSTEM,
  type ChatSuggestionItem,
  type ChatSuggestionTurn,
} from "./assistant/prompts/chat-suggestions.js"

const MAX_TURNS = 24
const MAX_CHARS_PER_TURN = 1_200
const MAX_LABEL_CHARS = 28
const MAX_MESSAGE_CHARS = 160

const cleanLine = (raw: string) =>
  raw.replace(/\s+/g, " ").trim().replace(/^["'«»]+|["'«»]+$/g, "")

const trimWords = (text: string, maxChars: number) => {
  if (text.length <= maxChars) {
    return text
  }
  const cut = text.slice(0, maxChars).trim()
  const lastSpace = cut.lastIndexOf(" ")
  return lastSpace > 6 ? cut.slice(0, lastSpace) : cut
}

const sanitizeLabel = (raw: unknown): string => {
  if (typeof raw !== "string") {
    return ""
  }
  const line = cleanLine(raw)
  if (!line) {
    return ""
  }
  return trimWords(line, MAX_LABEL_CHARS)
}

const sanitizeMessage = (raw: unknown): string => {
  if (typeof raw !== "string") {
    return ""
  }
  const line = cleanLine(raw)
  if (!line) {
    return ""
  }
  return line.length > MAX_MESSAGE_CHARS ? trimWords(line, MAX_MESSAGE_CHARS) : line
}

const normalizeTurns = (turns: ChatSuggestionTurn[]): ChatSuggestionTurn[] =>
  turns
    .filter((turn) => turn.text.trim())
    .slice(-MAX_TURNS)
    .map((turn) => ({
      role: turn.role,
      text: turn.text.trim().slice(0, MAX_CHARS_PER_TURN),
    }))

const parseSuggestionsPayload = (content: string): ChatSuggestionItem[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== "object" || !("suggestions" in parsed)) {
    return []
  }
  const list = (parsed as { suggestions?: unknown }).suggestions
  if (!Array.isArray(list)) {
    return []
  }
  const seen = new Set<string>()
  const out: ChatSuggestionItem[] = []
  for (const item of list) {
    let label = ""
    let message = ""
    if (typeof item === "string") {
      message = sanitizeMessage(item)
      label = sanitizeLabel(message)
    } else if (item && typeof item === "object") {
      const row = item as { label?: unknown; message?: unknown }
      message = sanitizeMessage(row.message)
      label = sanitizeLabel(row.label) || sanitizeLabel(message)
    }
    if (!label || !message || label.length < 2) {
      continue
    }
    const key = label.toLocaleLowerCase("es")
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push({ label, message })
    if (out.length >= 4) {
      break
    }
  }
  return out.length >= 2 ? out : []
}

export const generateChatSuggestions = async (turns: ChatSuggestionTurn[]): Promise<ChatSuggestionItem[]> => {
  const normalized = normalizeTurns(turns)
  const last = normalized.at(-1)
  if (!last || last.role !== "assistant") {
    return []
  }
  const hasUser = normalized.some((turn) => turn.role === "user")
  if (!hasUser || last.text.length < 12) {
    return []
  }

  if (!config.openaiApiKey) {
    return []
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiGreetingModel,
      temperature: 0.65,
      max_tokens: 220,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "chat_follow_up_suggestions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    message: { type: "string" },
                  },
                  required: ["label", "message"],
                  additionalProperties: false,
                },
              },
            },
            required: ["suggestions"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: "system", content: CHAT_SUGGESTIONS_SYSTEM },
        { role: "user", content: buildChatSuggestionsUserMessage(normalized) },
      ],
    }),
  })

  const payload = await response.text()
  if (!response.ok) {
    throw new Error(payload || "OpenAI rechazó las sugerencias de chat")
  }

  const parsed = JSON.parse(payload) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = parsed.choices?.[0]?.message?.content?.trim() ?? ""
  return parseSuggestionsPayload(content)
}
