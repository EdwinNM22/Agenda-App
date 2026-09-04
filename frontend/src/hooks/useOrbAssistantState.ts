import { useRef } from "react"
import { resolveOrbState, type OrbAssistantInput } from "@/lib/orb/resolve-orb-state"
import type { OrbState } from "@/lib/orb/orb-state"

const SPEAK_ON = 0.04
const SPEAK_OFF = 0.022

export const useOrbAssistantState = (input: Omit<OrbAssistantInput, "voiceLevel"> & { voiceLevel: number }): OrbState => {
  const speakingLatch = useRef(false)

  if (input.voiceLevel >= SPEAK_ON) {
    speakingLatch.current = true
  } else if (input.voiceLevel < SPEAK_OFF) {
    speakingLatch.current = false
  }

  const voiceLevel = speakingLatch.current
    ? Math.max(input.voiceLevel, SPEAK_ON)
    : input.voiceLevel

  return resolveOrbState({ ...input, voiceLevel })
}
