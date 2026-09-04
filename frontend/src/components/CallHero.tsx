import { motion } from "motion/react"
import { AssistantOrb } from "@/components/AssistantOrb"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/lib/auth"
import { useVoiceAssistant } from "@/lib/voice-assistant"

const ORB_SIZE_HOME = 200

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

export const CallHero = () => {
  const { user } = useAuth()
  const { start, live, status } = useVoiceAssistant()
  const active = live || status === "connecting"

  return (
    <section className="relative shrink-0 overflow-hidden px-5 pt-[calc(var(--k-safe-area-top)+0.5rem)]">
      <div className="pointer-events-none absolute inset-x-10 top-6 h-28 rounded-full bg-foreground/5 blur-3xl" />

      <div className="relative flex items-center gap-2.5">
        <Avatar className="size-10 ring-2 ring-background shadow-sm">
          {user?.avatarThumbUrl || user?.avatarUrl ? (
            <AvatarImage src={user.avatarThumbUrl ?? user.avatarUrl ?? ""} alt={user?.name} />
          ) : null}
          <AvatarFallback className="text-xs font-medium">{initials(user?.name ?? "")}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 leading-tight">
          <p className="text-xs text-muted-foreground">Hola</p>
          <h1 className="truncate text-xl font-semibold tracking-tight">{user?.name}</h1>
        </div>
      </div>

      <div className="relative mt-2 flex justify-center">
        <motion.div
          layoutId="assistant-orb"
          className="flex items-center justify-center"
          style={{ width: ORB_SIZE_HOME, height: ORB_SIZE_HOME }}
          animate={{ scale: active ? 1 : 0.97 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
        >
          <AssistantOrb size={ORB_SIZE_HOME} onActivate={active ? undefined : () => start()} />
        </motion.div>
      </div>
    </section>
  )
}
