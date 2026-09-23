import { Mic, PhoneOff } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import {
  ORB_COLOR_ACCENT,
  ORB_COLOR_FROM,
  ORB_COLOR_SKY,
  ORB_COLOR_TO,
} from "@/lib/orb/orb-state"
import { cn } from "@/lib/utils"

type VoiceMicButtonProps = {
  voiceSession: boolean
  connecting: boolean
  hearingUser: boolean
  live: boolean
  onClick: () => void
  size?: "md" | "lg"
  className?: string
}

const AI_CONIC = `conic-gradient(from 0deg, ${ORB_COLOR_FROM}, ${ORB_COLOR_TO}, ${ORB_COLOR_ACCENT}, ${ORB_COLOR_SKY}, ${ORB_COLOR_FROM})`

type MicAiAuraProps = {
  dim: number
  ringPad: number
  connecting: boolean
}

const MicAiAura = ({ dim, ringPad, connecting }: MicAiAuraProps) => {
  const ring = dim + ringPad * 2
  const spinSeconds = connecting ? 1.15 : 2.75

  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 rounded-full mix-blend-screen opacity-50"
        style={{
          width: ring + 14,
          height: ring + 14,
          marginLeft: -(ring + 14) / 2,
          marginTop: -(ring + 14) / 2,
          background: `radial-gradient(circle, ${ORB_COLOR_FROM}99 0%, ${ORB_COLOR_TO}55 42%, transparent 70%)`,
          filter: "blur(12px)",
        }}
      />

      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-[1] rounded-full"
        style={{
          width: ring,
          height: ring,
          marginLeft: -ring / 2,
          marginTop: -ring / 2,
          background: AI_CONIC,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: spinSeconds, repeat: Infinity, ease: "linear" }}
      />

      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-[1] size-5 rounded-full opacity-55 blur-md"
        style={{ background: ORB_COLOR_FROM, marginLeft: -10, marginTop: -10 }}
        animate={{
          x: [-7, 9, -5, 8, -7],
          y: [5, -7, 9, -4, 5],
        }}
        transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-[1] size-4 rounded-full opacity-50 blur-sm"
        style={{ background: ORB_COLOR_TO, marginLeft: -8, marginTop: -8 }}
        animate={{
          x: [7, -9, 5, -7, 7],
          y: [-5, 7, -8, 4, -5],
        }}
        transition={{ duration: 4.1, repeat: Infinity, ease: "easeInOut", delay: 0.45 }}
      />

    </>
  )
}

export const VoiceMicButton = ({
  voiceSession,
  connecting,
  hearingUser,
  live,
  onClick,
  size = "md",
  className,
}: VoiceMicButtonProps) => {
  const reduceMotion = useReducedMotion()
  /** Aura tipo asistente IA mientras no hay llamada activa (incluye conectando). */
  const showAiAura = !live && !reduceMotion
  const iconClass = size === "lg" ? "size-5" : "size-4"
  const buttonClass = size === "lg" ? "size-11" : "size-9"
  const dim = size === "lg" ? 44 : 36
  const ringPad = size === "lg" ? 3 : 2

  return (
    <span
      className={cn(
        "assistant-mic-btn relative inline-flex shrink-0 items-center justify-center",
        showAiAura && "assistant-mic-btn--ai",
        voiceSession && "assistant-mic-btn--live",
        connecting && "assistant-mic-btn--connecting",
        hearingUser && voiceSession && "assistant-mic-btn--hearing",
        className,
      )}
      style={{ width: dim, height: dim }}
    >
      {showAiAura ? <MicAiAura dim={dim} ringPad={ringPad} connecting={connecting} /> : null}

      <motion.span
        className="relative z-[1] inline-flex"
        whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      >
        <Button
          type="button"
          variant={voiceSession ? "destructive" : "default"}
          size="icon"
          className={cn(
            buttonClass,
            "rounded-full border shadow-md",
            voiceSession && live
              ? "glass-danger border shadow-sm"
              : "assistant-mic assistant-mic--ai-core",
            !voiceSession && live && "bg-primary/10 text-primary",
            hearingUser && !voiceSession && "ring-2 ring-primary/40",
          )}
          onClick={onClick}
          aria-label={voiceSession ? "Colgar" : connecting ? "Conectando voz…" : "Hablar con Isi"}
          aria-busy={connecting || undefined}
        >
          {voiceSession ? <PhoneOff className={iconClass} /> : <Mic className={iconClass} />}
        </Button>
      </motion.span>
    </span>
  )
}
