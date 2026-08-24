import { PhoneOff } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useLocation, useNavigate } from "react-router-dom"
import Orb from "@/components/Orb"
import { Button } from "@/components/ui/button"
import { useVoiceAssistant } from "@/lib/voice-assistant"
import { useTheme } from "@/lib/theme"

const hangUpBottom = "calc(var(--k-safe-area-bottom) + 6.25rem)"
const orbBottom = "calc(var(--k-safe-area-bottom) + 9.25rem)"

export const FloatingAssistant = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { theme, wallpaperColor } = useTheme()
  const { status, live, hangUp, voiceLevel } = useVoiceAssistant()
  const active = live || status === "connecting"
  const onHome = pathname === "/"

  return (
    <>
      <AnimatePresence>
        {active && !onHome ? (
          <motion.button
            key="assistant-orb"
            type="button"
            layoutId="assistant-orb"
            className="assistant-orb glass-surface pointer-events-auto fixed right-4 z-40 size-24 overflow-hidden rounded-full border"
            style={{ bottom: orbBottom }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.86 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={() => navigate("/")}
            aria-label="Volver al asistente"
          >
            <div className="assistant-orb-glow size-full">
            <Orb
              hue={270}
              hoverIntensity={0.22}
              rotateOnHover
              forceHoverState={live}
              voiceLevel={voiceLevel}
              backgroundColor={
                theme === "wallpaper" ? (wallpaperColor ?? "#1c1c1e") : theme === "light" ? "#ffffff" : "#1a1a1a"
              }
            />
            </div>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {active ? (
          <motion.div
            key="hang-up"
            className="pointer-events-auto fixed right-4 z-40"
            style={{ bottom: hangUpBottom }}
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
