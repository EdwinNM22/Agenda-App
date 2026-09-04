import { useRef } from "react"
import { ParticlesOrb } from "@/components/orb/ParticlesOrb"
import { useOrbAssistantState } from "@/hooks/useOrbAssistantState"
import { OrbStatus } from "@/lib/orb/orb-status"
import { useVoiceAssistant } from "@/lib/voice-assistant"
import { cn } from "@/lib/utils"

const ORB_COLOR_FROM = "#818cf8"
const ORB_COLOR_TO = "#22d3ee"
const ORB_SPEED = 0.5
const ORB_SIZE = 168

type AssistantOrbProps = {
  size?: number
  className?: string
  disabled?: boolean
  onActivate?: () => void
  label?: string
}

export const AssistantOrb = ({
  size = ORB_SIZE,
  className,
  disabled = false,
  onActivate,
  label = "Asistente de voz Isi",
}: AssistantOrbProps) => {
  const { status, live, busy, hearingUser, activity, voiceLevel, userLevel } = useVoiceAssistant()
  const levelRef = useRef(-1)

  const orbState = useOrbAssistantState({
    status,
    live,
    busy,
    hearingUser,
    activity,
    voiceLevel,
    disabled,
  })

  const canStart = orbState === "idle" || orbState === "error"
  const interactive = canStart && Boolean(onActivate)
  const scale = size / ORB_SIZE

  levelRef.current =
    orbState === "speaking"
      ? voiceLevel
      : orbState === "listening" && hearingUser
        ? userLevel
        : -1

  return (
    <div
      className={cn(
        "relative grid place-items-center",
        interactive && "cursor-pointer transition-transform active:scale-95",
        className,
      )}
      style={{ width: size, height: size }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onActivate : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onActivate?.()
              }
            }
          : undefined
      }
      aria-label={interactive ? "Hablar con Isi" : undefined}
    >
      <div
        className="grid place-items-center"
        style={{
          width: ORB_SIZE,
          height: ORB_SIZE,
          transform: scale === 1 ? undefined : `scale(${scale})`,
        }}
      >
        <ParticlesOrb
          state={orbState}
          size={ORB_SIZE}
          speed={ORB_SPEED}
          colorFrom={ORB_COLOR_FROM}
          colorTo={ORB_COLOR_TO}
          levelRef={levelRef}
          label={label}
          className="pointer-events-none"
        />
      </div>
      <OrbStatus state={orbState} className="sr-only" />
    </div>
  )
}
