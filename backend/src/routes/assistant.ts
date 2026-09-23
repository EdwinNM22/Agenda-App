import type { FastifyInstance } from "fastify"
import { pool, type UserRow } from "../db.js"
import type { ChatSuggestionTurn } from "../assistant/prompts/chat-suggestions.js"
import { generateChatSuggestions } from "../chatSuggestions.js"
import { generateConversationTitle } from "../conversationTitle.js"
import { getHomeGreeting } from "../homeGreeting.js"

export const registerAssistantRoutes = async (app: FastifyInstance) => {
  app.get(
    "/assistant/home-greeting",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const [userRows] = await pool.query<UserRow[]>(
        "SELECT name FROM users WHERE id = :id LIMIT 1",
        { id: request.user.sub },
      )
      const userName = userRows[0]?.name?.trim() || "ahí"
      try {
        const greeting = await getHomeGreeting(request.user.sub, userName)
        void reply.header("Cache-Control", "private, no-store")
        return { greeting }
      } catch (error) {
        request.log.warn({ err: error }, "No se pudo generar saludo de Home")
        return reply.code(502).send({ message: "No se pudo generar el saludo" })
      }
    },
  )

  app.post(
    "/assistant/chat-suggestions",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const body = request.body as { messages?: Array<{ role?: string; text?: string }> }
      const raw = Array.isArray(body.messages) ? body.messages : []
      const messages: ChatSuggestionTurn[] = []
      for (const item of raw) {
        const text = item.text?.trim() ?? ""
        if (!text) {
          continue
        }
        if (item.role === "user" || item.role === "assistant") {
          messages.push({ role: item.role, text })
        }
      }
      if (messages.length === 0) {
        return { suggestions: [] as Array<{ label: string; message: string }> }
      }
      try {
        const suggestions = await generateChatSuggestions(messages)
        void reply.header("Cache-Control", "private, no-store")
        return { suggestions }
      } catch (error) {
        request.log.warn({ err: error }, "No se pudieron generar sugerencias de chat")
        return { suggestions: [] as Array<{ label: string; message: string }> }
      }
    },
  )

  app.post(
    "/assistant/conversation-title",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const body = request.body as { userText?: string; assistantText?: string }
      const userText = body.userText?.trim() ?? ""
      const assistantText = body.assistantText?.trim() ?? ""
      if (!userText) {
        return reply.code(400).send({ message: "Falta el mensaje del usuario" })
      }
      try {
        const title = await generateConversationTitle(userText, assistantText)
        void reply.header("Cache-Control", "private, no-store")
        return { title }
      } catch (error) {
        request.log.warn({ err: error }, "No se pudo generar título de conversación")
        return reply.code(502).send({ message: "No se pudo generar el título" })
      }
    },
  )
}
