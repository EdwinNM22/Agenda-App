import os from "node:os"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

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

export default defineConfig({
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
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
