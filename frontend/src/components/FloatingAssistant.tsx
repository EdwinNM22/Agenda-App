import { AnimatePresence, motion } from "motion/react"
import { useLocation, useNavigate } from "react-router-dom"
import { AssistantOrb } from "@/components/AssistantOrb"
import { ActivityPill, activityLabel } from "@/components/BusyState"
import { useVoiceAssistant } from "@/lib/voice-assistant"

const orbBottom = "calc(var(--k-safe-area-bottom) + 6.5rem)"

/** Orb + activity cuando la llamada está activa fuera de Home. El colgar vive en la tab bar. */
export const FloatingAssistant = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { status, live, activity } = useVoiceAssistant()
  const active = live || status === "connecting"
  const onHome = pathname === "/"
  const statusCopy = activityLabel(activity)

  return (
    <>
      <AnimatePresence>
        {active && !onHome ? (
          <motion.button
            key="assistant-orb"
            type="button"
            layoutId="assistant-orb"
            className="pointer-events-auto fixed right-4 z-40"
            style={{ bottom: orbBottom }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.86 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={() => navigate("/")}
            aria-label="Volver al asistente"
          >
            <AssistantOrb size={96} />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {active && !onHome && statusCopy ? (
          <motion.div
            key="assistant-activity"
            className="pointer-events-none fixed right-[7.5rem] z-40"
            style={{ bottom: `calc(${orbBottom} + 1.75rem)` }}
            initial={{ opacity: 0, x: 10, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
          >
            <ActivityPill>{statusCopy}</ActivityPill>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
