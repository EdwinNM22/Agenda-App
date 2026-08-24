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

export const VOICE_OPTIONS: { value: RealtimeVoice; label: string }[] = [
  { value: "marin", label: "Marin (recomendada)" },
  { value: "cedar", label: "Cedar (recomendada)" },
  { value: "alloy", label: "Alloy" },
  { value: "ash", label: "Ash" },
  { value: "ballad", label: "Ballad" },
  { value: "coral", label: "Coral" },
  { value: "echo", label: "Echo" },
  { value: "sage", label: "Sage" },
  { value: "shimmer", label: "Shimmer" },
  { value: "verse", label: "Verse" },
]

export const isRealtimeVoice = (value: string): value is RealtimeVoice =>
  REALTIME_VOICES.includes(value as RealtimeVoice)
