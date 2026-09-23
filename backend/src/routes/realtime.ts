import { createHash } from "node:crypto"
import type { FastifyInstance } from "fastify"
import {
  buildGreetingInstruction,
  buildRealtimeSession,
  buildRealtimeTextClientSecretRequest,
} from "../assistant/index.js"
import { config } from "../config.js"
import { pool, type UserRow } from "../db.js"
import { getVoicePreview } from "../voicePreview.js"
import { DEFAULT_VOICE, isRealtimeVoice, REALTIME_VOICES, type RealtimeVoice } from "../voices.js"

type SessionBody = {
  sdp: string
  voice?: string
}

export const registerRealtimeRoutes = async (app: FastifyInstance) => {
  app.post<{ Body: SessionBody }>(
    "/realtime/session",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["sdp"],
          properties: {
            sdp: { type: "string", minLength: 1 },
            voice: { type: "string", enum: [...REALTIME_VOICES] },
          },
        },
      },
    },
    async (request, reply) => {
      if (!config.openaiApiKey) {
        return reply.code(503).send({
          message: "Falta OPENAI_API_KEY en backend/.env",
        })
      }

      const requestedVoice = request.body.voice ?? ""
      const voice: RealtimeVoice = isRealtimeVoice(requestedVoice)
        ? requestedVoice
        : DEFAULT_VOICE

      const [userRows] = await pool.query<UserRow[]>(
        "SELECT name FROM users WHERE id = :id LIMIT 1",
        { id: request.user.sub },
      )
      const userName = userRows[0]?.name?.trim().split(/\s+/)[0] || "ahí"

      const session = JSON.stringify(buildRealtimeSession(userName, voice))

      const form = new FormData()
      form.set("sdp", request.body.sdp)
      form.set("session", session)

      const safetyId = createHash("sha256")
        .update(`agenda:${request.user.sub}`)
        .digest("hex")

      const openaiResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          "OpenAI-Safety-Identifier": safetyId,
        },
        body: form,
      })

      const payload = await openaiResponse.text()

      if (!openaiResponse.ok) {
        let message = "No se pudo iniciar la sesión de voz"
        try {
          const parsed = JSON.parse(payload) as {
            error?: { message?: string }
          }
          if (parsed.error?.message) {
            message = parsed.error.message
          }
        } catch {
          // OpenAI a veces responde SDP o texto plano
        }
        request.log.warn(
          { status: openaiResponse.status, openaiError: message, body: payload.slice(0, 500) },
          "OpenAI Realtime rechazó la sesión",
        )
        return reply.code(502).send({ message })
      }

      return { sdp: payload, userName, greetingInstruction: buildGreetingInstruction(userName) }
    },
  )

  app.post(
    "/realtime/text-session",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!config.openaiApiKey) {
        return reply.code(503).send({
          message: "Falta OPENAI_API_KEY en backend/.env",
        })
      }

      const [userRows] = await pool.query<UserRow[]>(
        "SELECT name FROM users WHERE id = :id LIMIT 1",
        { id: request.user.sub },
      )
      const userName = userRows[0]?.name?.trim().split(/\s+/)[0] || "ahí"

      const safetyId = createHash("sha256")
        .update(`agenda:${request.user.sub}`)
        .digest("hex")

      const openaiResponse = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyId,
        },
        body: JSON.stringify(buildRealtimeTextClientSecretRequest(userName)),
      })

      const payload = await openaiResponse.text()
      if (!openaiResponse.ok) {
        let message = "No se pudo iniciar el chat de texto"
        try {
          const parsed = JSON.parse(payload) as { error?: { message?: string } }
          if (parsed.error?.message) {
            message = parsed.error.message
          }
        } catch {
          // respuesta no JSON
        }
        request.log.warn(
          { status: openaiResponse.status, body: payload.slice(0, 500) },
          "OpenAI Realtime rechazó sesión de texto",
        )
        return reply.code(502).send({ message })
      }

      const secret = JSON.parse(payload) as {
        value?: string
        session?: { model?: string }
      }
      const clientSecret = secret.value?.trim()
      if (!clientSecret) {
        return reply.code(502).send({ message: "OpenAI no devolvió credencial de chat" })
      }

      return {
        clientSecret,
        model: secret.session?.model?.trim() || config.openaiRealtimeModel,
      }
    },
  )

  app.post<{ Body: { message?: string } }>(
    "/realtime/log",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const message = request.body.message?.trim() || ""
      if (message) {
        console.log(`[Isi] ${message}`)
      }
      return { ok: true }
    },
  )

  app.post<{ Body: { voice?: string; name?: string } }>(
    "/realtime/preview",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["voice"],
          properties: {
            voice: { type: "string", enum: [...REALTIME_VOICES] },
            name: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!config.openaiApiKey) {
        return reply.code(503).send({
          message: "Falta OPENAI_API_KEY en backend/.env",
        })
      }

      const requestedVoice = request.body.voice ?? ""
      const voice: RealtimeVoice = isRealtimeVoice(requestedVoice)
        ? requestedVoice
        : DEFAULT_VOICE
      const userName = request.body.name?.trim() || "ahí"

      try {
        const audio = await getVoicePreview(voice, userName)
        return reply
          .header("Cache-Control", "private, max-age=86400")
          .type("audio/mpeg")
          .send(audio)
      } catch (error) {
        request.log.warn({ err: error }, "No se pudo generar la preescucha de voz")
        return reply.code(502).send({ message: "No se pudo reproducir la voz" })
      }
    },
  )
}
