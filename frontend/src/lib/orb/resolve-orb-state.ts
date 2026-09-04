import type { ToolActivity, VoiceStatus } from "@/hooks/useRealtimeVoice"
import type { OrbState } from "@/lib/orb/orb-state"

const ASSISTANT_SPEAKING_LEVEL = 0.035

export type OrbAssistantInput = {
  status: VoiceStatus
  live: boolean
  busy: boolean
  hearingUser: boolean
  activity: ToolActivity
  voiceLevel: number
  disabled?: boolean
}

export const resolveOrbState = ({
  status,
  live,
  busy,
  hearingUser,
  activity,
  voiceLevel,
  disabled = false,
}: OrbAssistantInput): OrbState => {
  if (disabled) {
    return "disabled"
  }
  if (status === "error") {
    return "error"
  }
  if (status === "connecting") {
    return "connecting"
  }
  if (!live) {
    return "idle"
  }

  // El usuario habla (VAD del servidor, no ruido de micrófono)
  if (hearingUser) {
    return "listening"
  }

  // Isi habla (audio remoto)
  if (voiceLevel >= ASSISTANT_SPEAKING_LEVEL) {
    return "speaking"
  }

  // Procesando tools o generando respuesta
  if (busy || activity) {
    return "thinking"
  }

  // Turno del usuario, en espera
  return "listening"
}
