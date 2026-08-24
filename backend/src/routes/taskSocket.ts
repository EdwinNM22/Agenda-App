import type { FastifyInstance } from "fastify"
import { subscribeTaskSocket, unsubscribeTaskSocket } from "../taskHub.js"

type SocketQuery = {
  token?: string
}

export const registerTaskSocketRoutes = async (app: FastifyInstance) => {
  app.get<{ Querystring: SocketQuery }>(
    "/ws/tasks",
    { websocket: true },
    (socket, request) => {
      const token = request.query.token
      if (!token) {
        socket.close(4401, "No autorizado")
        return
      }

      let userId: number
      try {
        const payload = app.jwt.verify<{ sub: number }>(token)
        userId = payload.sub
      } catch {
        socket.close(4401, "No autorizado")
        return
      }

      subscribeTaskSocket(userId, socket)

      socket.on("message", (raw: Buffer | Buffer[] | string) => {
        const text = Buffer.isBuffer(raw)
          ? raw.toString("utf8")
          : Array.isArray(raw)
            ? Buffer.concat(raw).toString("utf8")
            : raw
        try {
          const message = JSON.parse(text) as { type?: string }
          if (message.type === "ping") {
            socket.send(JSON.stringify({ type: "pong" }))
          }
        } catch {
          // ignorar frames que no sean JSON
        }
      })

      socket.on("close", () => {
        unsubscribeTaskSocket(userId, socket)
      })

      socket.on("error", () => {
        unsubscribeTaskSocket(userId, socket)
      })
    },
  )
}
