import type { OrbState } from "@/lib/orb/orb-state"

const STATUS_TEXT: Record<OrbState, string> = {
  idle: "En espera",
  connecting: "Conectando",
  listening: "Escuchando",
  thinking: "Pensando",
  speaking: "Hablando",
  error: "Error",
  disabled: "Desactivado",
}

export interface OrbStatusProps {
  state: OrbState
  className?: string
}

export const OrbStatus = ({ state, className }: OrbStatusProps) => (
  <span role="status" aria-live="polite" aria-atomic="true" className={className}>
    {STATUS_TEXT[state]}
  </span>
)
