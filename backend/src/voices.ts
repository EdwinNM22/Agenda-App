export const REALTIME_VOICES = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const

export type RealtimeVoice = (typeof REALTIME_VOICES)[number]

export const DEFAULT_VOICE: RealtimeVoice = "marin"

export const isRealtimeVoice = (value: string): value is RealtimeVoice =>
  (REALTIME_VOICES as readonly string[]).includes(value)
