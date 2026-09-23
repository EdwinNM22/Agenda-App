import { PhoneOff } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { AssistantOrb } from "@/components/AssistantOrb"
import { ActivityPill, activityLabel } from "@/components/BusyState"
import { Button } from "@/components/ui/button"
import { useAssistantSheet } from "@/lib/assistantSheet"
import { useVoiceAssistant } from "@/lib/voice-assistant"

/** Orb a la derecha; colgar a la izquierda para no solaparse con la X del sheet ni con el orb. */
const floatBottom = "calc(var(--agenda-tabbar-offset) + 0.75rem)"

/** Orb + actividad cuando hay llamada y el chat sheet está cerrado. */
export const FloatingAssistant = () => {
  const { open: sheetOpen, openSheet } = useAssistantSheet()
  const { status, live, hangUp, activity } = useVoiceAssistant()
  const active = live || status === "connecting"
  const statusCopy = activityLabel(activity)

  if (sheetOpen) {
    return null
  }

  return (
    <>
      <AnimatePresence>
        {active ? (
          <motion.button
            key="assistant-orb"
            type="button"
            className="pointer-events-auto fixed right-4 z-40 overflow-hidden rounded-full"
            style={{ bottom: floatBottom }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.86 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={() => openSheet()}
            aria-label="Volver al asistente"
          >
            <AssistantOrb size={96} />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {active && statusCopy ? (
          <motion.div
            key="assistant-activity"
            className="pointer-events-none fixed right-[7.25rem] z-40 max-w-[min(12rem,calc(100vw-8.5rem))]"
            style={{ bottom: `calc(${floatBottom} + 2rem)` }}
            initial={{ opacity: 0, x: 10, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
          >
            <ActivityPill>{statusCopy}</ActivityPill>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {active ? (
          <motion.div
            key="hang-up"
            className="pointer-events-auto fixed left-4 z-40"
            style={{ bottom: floatBottom }}
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.86, y: 10 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
          >
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="glass-danger size-12 rounded-full border shadow-md"
              onClick={hangUp}
              aria-label="Colgar"
            >
              <PhoneOff />
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
