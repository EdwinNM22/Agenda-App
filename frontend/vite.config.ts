import os from "node:os"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

const httpsEnabled = process.env.DEV_HTTPS === "1"

const lanAddresses = (): string[] => {
  const ips: string[] = []
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.internal || net.family !== "IPv4") continue
      ips.push(net.address)
    }
  }
  return ips
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname), "")
  const rawApi = env.VITE_API_URL?.trim().replace(/\/$/, "") ?? ""
  const apiTarget = !rawApi
    ? "http://127.0.0.1:3001"
    : /^https?:\/\//i.test(rawApi)
      ? rawApi
      : `http://${/:\d+$/.test(rawApi) ? rawApi : `${rawApi}:3001`}`

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(httpsEnabled
        ? [
            basicSsl({
              name: "agenda",
              domains: ["localhost", "127.0.0.1", ...lanAddresses()],
              certDir: path.resolve(import.meta.dirname, "../.certs"),
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      host: true,
      proxy: {
        "/health": { target: apiTarget, changeOrigin: true },
        "/auth": { target: apiTarget, changeOrigin: true },
        "/realtime": { target: apiTarget, changeOrigin: true },
        "/tasks": { target: apiTarget, changeOrigin: true },
        "/uploads": { target: apiTarget, changeOrigin: true },
        "/ws": { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
  }
})
