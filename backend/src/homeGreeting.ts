import { config } from "./config.js"
import {
  buildHomeGreetingUserMessage,
  HOME_GREETING_SYSTEM,
  pickHomeGreetingStyleHint,
} from "./assistant/prompts/home-greeting.js"
import { randomUUID } from "node:crypto"

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "ahí"

const sanitizeLine = (raw: string, name: string) => {
  const line = raw.replace(/\s+/g, " ").trim().replace(/^["'«»]+|["'«»]+$/g, "")
  if (!line) {
    return fallbackGreeting(name)
  }
  const needle = firstName(name).toLocaleLowerCase("es")
  if (needle && !line.toLocaleLowerCase("es").includes(needle)) {
    return `¡Hola, ${firstName(name)}! ${line}`
  }
  return line
}

export const fallbackGreeting = (name: string) => {
  const who = firstName(name)
  return who === "ahí" ? "¡Hola! ¿En qué te ayudo hoy?" : `¡Hola, ${who}! ¿En qué te ayudo hoy?`
}

const generateHomeGreeting = async (userName: string) => {
  if (!config.openaiApiKey) {
    return fallbackGreeting(userName)
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiGreetingModel,
      temperature: 1,
      top_p: 0.95,
      presence_penalty: 0.65,
      frequency_penalty: 0.35,
      max_tokens: 48,
      messages: [
        { role: "system", content: HOME_GREETING_SYSTEM },
        {
          role: "user",
          content: buildHomeGreetingUserMessage(
            firstName(userName),
            randomUUID(),
            pickHomeGreetingStyleHint(),
          ),
        },
      ],
    }),
  })

  const payload = await response.text()
  if (!response.ok) {
    throw new Error(payload || "OpenAI rechazó el saludo de Home")
  }

  const parsed = JSON.parse(payload) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = parsed.choices?.[0]?.message?.content?.trim() ?? ""
  return sanitizeLine(content, userName)
}

export const getHomeGreeting = async (_userId: number, userName: string) => {
  try {
    return await generateHomeGreeting(userName)
  } catch {
    return fallbackGreeting(userName)
  }
}
