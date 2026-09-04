import { config as loadEnv } from "dotenv"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Siempre el .env del backend, no el cwd (PM2/systemd suelen arrancar desde otra carpeta).
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") })

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno ${name}`)
  }
  return value
}

const parseCorsOrigins = (value: string): string[] =>
  value
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean)

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  jwtSecret: required("JWT_SECRET", "cambia-esta-clave-en-local"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN ?? ""),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiRealtimeModel: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1-mini",
  vapidPublicKey: (process.env.VAPID_PUBLIC_KEY ?? "").trim(),
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY?.trim() ?? "",
  vapidSubject: (process.env.VAPID_SUBJECT ?? "mailto:hola@example.com").trim(),
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "agenda",
    socketPath: process.env.DB_SOCKET || undefined,
  },
  prestamo: {
    apiUrl: (process.env.PRESTAMO_API_URL ?? "http://127.0.0.1:8083").trim().replace(/\/$/, ""),
    hubApiKey: (process.env.PRESTAMO_HUB_API_KEY ?? "").trim(),
    tenant: (process.env.PRESTAMO_TENANT ?? "atlas").trim().toLowerCase(),
    timeoutMs: Number(process.env.PRESTAMO_TIMEOUT_MS ?? 15_000),
  },
} as const
