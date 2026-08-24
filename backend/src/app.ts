import Fastify from "fastify"
import cors from "@fastify/cors"
import jwt from "@fastify/jwt"
import multipart from "@fastify/multipart"
import fastifyStatic from "@fastify/static"
import websocket from "@fastify/websocket"
import { config } from "./config.js"
import { registerAuthRoutes } from "./routes/auth.js"
import { registerHealthRoutes } from "./routes/health.js"
import { registerRealtimeRoutes } from "./routes/realtime.js"
import { registerTaskSocketRoutes } from "./routes/taskSocket.js"
import { registerTaskRoutes } from "./routes/tasks.js"
import { avatarsDir, attachmentsDir, wallpapersDir, ensureUploadDirs } from "./uploads.js"

const normalizeOrigin = (origin: string): string => origin.trim().replace(/\/$/, "")

const isLocalDevOrigin = (origin: string): boolean => {
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol !== "http:" && protocol !== "https:") {
      return false
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true
    }
    const parts = hostname.split(".").map(Number)
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
      return false
    }
    const [first, second] = parts
    return (
      first === 10 ||
      (first === 192 && second === 168) ||
      (first === 172 && second >= 16 && second <= 31)
    )
  } catch {
    return false
  }
}

const isAllowedOrigin = (origin: string): boolean => {
  const normalized = normalizeOrigin(origin)
  if (isLocalDevOrigin(normalized)) {
    return true
  }
  if (config.corsOrigins.includes("*")) {
    return true
  }
  return config.corsOrigins.includes(normalized)
}

export const buildApp = async () => {
  const app = Fastify({
    logger: true,
  })

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true)
        return
      }
      app.log.warn({ origin }, "CORS rechazó el origen")
      callback(null, false)
    },
    credentials: true,
  })

  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: config.jwtExpiresIn,
    },
  })

  await app.register(websocket)
  await ensureUploadDirs()
  await app.register(multipart, {
    limits: {
      fileSize: 12 * 1024 * 1024,
      files: 6,
    },
  })
  await app.register(fastifyStatic, {
    root: avatarsDir,
    prefix: "/api/uploads/avatars/",
    decorateReply: false,
    wildcard: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".webp")) {
        res.header("Cache-Control", "public, max-age=31536000, immutable")
      }
    },
  })
  await app.register(fastifyStatic, {
    root: wallpapersDir,
    prefix: "/api/uploads/wallpapers/",
    decorateReply: false,
    wildcard: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".webp")) {
        res.header("Cache-Control", "public, max-age=31536000, immutable")
      }
    },
  })
  await app.register(fastifyStatic, {
    root: attachmentsDir,
    prefix: "/api/uploads/attachments/",
    decorateReply: false,
    wildcard: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".webp")) {
        res.header("Cache-Control", "public, max-age=31536000, immutable")
      }
    },
  })

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({ message: "No autorizado" })
    }
  })

  await app.register(
    async (api) => {
      await registerHealthRoutes(api)
      await registerAuthRoutes(api)
      await registerRealtimeRoutes(api)
      await registerTaskRoutes(api)
      await registerTaskSocketRoutes(api)
    },
    { prefix: "/api" },
  )

  return app
}
