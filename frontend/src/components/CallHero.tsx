import { Mic } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import Orb from "@/components/Orb"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import { useVoiceAssistant } from "@/lib/voice-assistant"
import { cn } from "@/lib/utils"

const idleCopy = "Toca para hablar con EC"

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

export const CallHero = () => {
  const { user } = useAuth()
  const { theme, wallpaperColor } = useTheme()
  const { status, error, start, voiceLevel, live } = useVoiceAssistant()
  const active = live || status === "connecting"

  return (
    <section className="relative overflow-hidden px-5 pt-6">
      <div className="pointer-events-none absolute inset-x-8 top-10 h-40 rounded-full bg-foreground/6 blur-3xl" />

      <div className="relative flex items-center gap-3">
        <Avatar className="size-12 ring-2 ring-background shadow-sm">
          {user?.avatarThumbUrl || user?.avatarUrl ? (
            <AvatarImage src={user.avatarThumbUrl ?? user.avatarUrl ?? ""} alt={user?.name} />
          ) : null}
          <AvatarFallback className="text-sm font-medium">{initials(user?.name ?? "")}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Hola</p>
          <h1 className="truncate text-3xl font-semibold tracking-tight">{user?.name}</h1>
        </div>
      </div>

      <div className="relative mt-6 flex flex-col items-center">
        <div className={cn("flex items-center justify-center", active ? "size-40" : "size-28")}>
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div
                key="orb"
                layoutId="assistant-orb"
                className="assistant-orb relative size-40 overflow-hidden rounded-full"
                initial={{ opacity: 0, scale: 0.86 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 280, damping: 26 }}
              >
                <Orb
                  hue={270}
                  hoverIntensity={0.22}
                  rotateOnHover
                  forceHoverState={live}
                  voiceLevel={voiceLevel}
                  backgroundColor={
                    theme === "wallpaper" ? (wallpaperColor ?? "#1c1c1e") : theme === "light" ? "#f6f6f6" : "#0a0a0a"
                  }
                />
              </motion.div>
            ) : (
              <motion.button
                key="call"
                type="button"
                className={cn(
                  "assistant-mic relative flex size-28 items-center justify-center rounded-full text-primary-foreground shadow-[0_18px_50px_-18px_rgba(0,0,0,0.45)] transition-transform active:scale-95",
                  status === "error" ? "bg-destructive" : "bg-primary",
                )}
                initial={{ opacity: 0, scale: 0.86 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.86 }}
                transition={{ type: "spring", stiffness: 160, damping: 16 }}
                onClick={() => start()}
                aria-label="Hablar con EC"
              >
                <span className="absolute inset-0 animate-pulse rounded-full bg-primary/25" />
                <Mic className="relative size-9" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {active ? null : <p className="mt-5 text-sm font-medium">{idleCopy}</p>}
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
    </section>
  )
}
