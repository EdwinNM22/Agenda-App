import { config } from "./config.js"
import {
  buildConversationTitleUserMessage,
  CONVERSATION_TITLE_SYSTEM,
} from "./assistant/prompts/conversation-title.js"

const sanitizeTitle = (raw: string) => {
  const line = raw.replace(/\s+/g, " ").trim().replace(/^["'«»]+|["'«»]+$/g, "")
  if (!line) {
    return ""
  }
  return line.length > 64 ? `${line.slice(0, 61)}…` : line
}

export const fallbackConversationTitle = (userText: string) => {
  const words = userText.trim().split(/\s+/).filter(Boolean).slice(0, 6)
  if (words.length === 0) {
    return "Nueva conversación"
  }
  const joined = words.join(" ")
  return joined.length > 48 ? `${joined.slice(0, 45)}…` : joined
}

export const generateConversationTitle = async (userText: string, assistantText: string) => {
  const fallback = fallbackConversationTitle(userText)
  if (!config.openaiApiKey) {
    return fallback
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiGreetingModel,
      temperature: 0.6,
      max_tokens: 24,
      messages: [
        { role: "system", content: CONVERSATION_TITLE_SYSTEM },
        {
          role: "user",
          content: buildConversationTitleUserMessage(userText, assistantText),
        },
      ],
    }),
  })

  const payload = await response.text()
  if (!response.ok) {
    throw new Error(payload || "OpenAI rechazó el título")
  }

  const parsed = JSON.parse(payload) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = parsed.choices?.[0]?.message?.content?.trim() ?? ""
  return sanitizeTitle(content) || fallback
}
