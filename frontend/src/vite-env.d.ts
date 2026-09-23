/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __EC_DEV_PWA__: boolean

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
