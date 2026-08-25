import type { FastifyInstance } from "fastify"
import { pool } from "../db.js"
import { config } from "../config.js"
import { pushEnabled } from "../push.js"

type SubscribeBody = {
  endpoint?: string
  keys?: {
    p256dh?: string
    auth?: string
  }
}

type UnsubscribeBody = {
  endpoint?: string
}

export const registerPushRoutes = async (app: FastifyInstance) => {
  app.get("/push/vapid-public-key", { onRequest: [app.authenticate] }, async (_request, reply) => {
    if (!pushEnabled()) {
      return reply.code(503).send({ message: "Los avisos no están configurados en el servidor" })
    }
    return { publicKey: config.vapidPublicKey }
  })

  app.post<{ Body: SubscribeBody }>(
    "/push/subscribe",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!pushEnabled()) {
        return reply.code(503).send({ message: "Los avisos no están configurados en el servidor" })
      }

      const endpoint = request.body.endpoint?.trim() ?? ""
      const p256dh = request.body.keys?.p256dh?.trim() ?? ""
      const auth = request.body.keys?.auth?.trim() ?? ""
      if (!endpoint || !p256dh || !auth || !endpoint.startsWith("https://")) {
        return reply.code(400).send({ message: "La suscripción no es válida" })
      }
      if (endpoint.length > 1024 || p256dh.length > 255 || auth.length > 255) {
        return reply.code(400).send({ message: "La suscripción no es válida" })
      }

      await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES (:userId, :endpoint, :p256dh, :auth)
         ON DUPLICATE KEY UPDATE
           user_id = VALUES(user_id),
           p256dh = VALUES(p256dh),
           auth = VALUES(auth)`,
        { userId: request.user.sub, endpoint, p256dh, auth },
      )
      return { ok: true }
    },
  )

  app.delete<{ Body: UnsubscribeBody }>(
    "/push/subscribe",
    { onRequest: [app.authenticate] },
    async (request) => {
      const endpoint = request.body.endpoint?.trim() ?? ""
      if (endpoint) {
        await pool.query(
          "DELETE FROM push_subscriptions WHERE user_id = :userId AND endpoint = :endpoint",
          { userId: request.user.sub, endpoint },
        )
      }
      return { ok: true }
    },
  )
}
