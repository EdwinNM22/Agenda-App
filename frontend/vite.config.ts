import os from "node:os"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const httpsEnabled = process.env.DEV_HTTPS === "1"
// Safari iOS corrompe fácil el SW en `vite dev` (pantalla en blanco hasta borrar datos del sitio).
// HTTPS local no implica SW: actívalo solo con DEV_PWA=1 cuando pruebes push/PWA.
const pwaDevEnabled = process.env.DEV_PWA === "1"

const permissionHeaders = {
  "Permissions-Policy": "microphone=(self), camera=()",
}

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
  const backendEnv = loadEnv(mode, path.resolve(import.meta.dirname, "../backend"), "")
  const backendPort = backendEnv.PORT?.trim() || "3001"
  const rawApi = env.VITE_API_URL?.trim().replace(/\/$/, "") ?? ""
  const apiTarget = !rawApi
    ? `http://127.0.0.1:${backendPort}`
    : /^https?:\/\//i.test(rawApi)
      ? rawApi
      : `http://${/:\d+$/.test(rawApi) ? rawApi : `${rawApi}:${backendPort}`}`

  const proxy = {
    "/api": { target: apiTarget, changeOrigin: true },
    "/health": { target: apiTarget, changeOrigin: true },
    "/auth": { target: apiTarget, changeOrigin: true },
    "/realtime": { target: apiTarget, changeOrigin: true },
    "/tasks": { target: apiTarget, changeOrigin: true },
    "/uploads": { target: apiTarget, changeOrigin: true },
    "/push": { target: apiTarget, changeOrigin: true },
    "/ws": { target: apiTarget, changeOrigin: true, ws: true },
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt",
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,woff,woff2,wasm,mjs}"],
          globIgnores: ["**/node_modules/**/*", "sw.js", "**/*.map"],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        },
        includeAssets: [
          "favicon.png",
          "favicon-16.png",
          "favicon-32.png",
          "apple-touch-icon.jpg",
          "brand/**/*.png",
          "pwa/**/*.jpg",
        ],
        manifest: {
          id: "/",
          name: "EC Agenda",
          short_name: "Agenda",
          description: "Agenda personal con recordatorios y asistente de voz",
          lang: "es",
          dir: "ltr",
          start_url: "/",
          scope: "/",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait",
          background_color: "#0a0a0a",
          theme_color: "#0a0a0a",
          categories: ["productivity"],
          icons: [
            {
              src: "/pwa/icon-192x192.jpg",
              sizes: "192x192",
              type: "image/jpeg",
              purpose: "any",
            },
            {
              src: "/pwa/icon-512x512.jpg",
              sizes: "512x512",
              type: "image/jpeg",
              purpose: "any",
            },
            {
              src: "/pwa/maskable-512x512.jpg",
              sizes: "512x512",
              type: "image/jpeg",
              purpose: "maskable",
            },
          ],
          shortcuts: [
            {
              name: "Agenda",
              url: "/tareas",
              icons: [{ src: "/pwa/icon-192x192.jpg", sizes: "192x192", type: "image/jpeg" }],
            },
            {
              name: "Ajustes",
              url: "/opciones",
              icons: [{ src: "/pwa/icon-192x192.jpg", sizes: "192x192", type: "image/jpeg" }],
            },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [
            /^\/auth(?:\/|$)/,
            /^\/tasks(?:\/|$)/,
            /^\/realtime(?:\/|$)/,
            /^\/health(?:\/|$)/,
            /^\/uploads(?:\/|$)/,
            /^\/ws(?:\/|$)/,
            /^\/push(?:\/|$)/,
            /^\/api(?:\/|$)/,
          ],
        },
        devOptions: {
          enabled: pwaDevEnabled,
          type: "module",
          navigateFallback: "index.html",
        },
      }),
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
      headers: permissionHeaders,
      proxy,
    },
    preview: {
      host: true,
      headers: permissionHeaders,
      proxy,
    },
  }
})
