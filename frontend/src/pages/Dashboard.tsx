import { useEffect, useState } from "react"
import { Mic, PhoneOff } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import Orb from "@/components/Orb"
import { TaskBoard } from "@/components/TaskBoard"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAudioLevel } from "@/hooks/useAudioLevel"
import { useRealtimeVoice } from "@/hooks/useRealtimeVoice"
import { useSilenceHangup } from "@/hooks/useSilenceHangup"
import { useSpeechCommands } from "@/hooks/useSpeechCommands"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import {
  DEFAULT_VOICE,
  isRealtimeVoice,
  VOICE_OPTIONS,
  type RealtimeVoice,
} from "@/lib/voices"

const VOICE_STORAGE_KEY = "agenda.realtimeVoice"

const statusLabel = {
  idle: "Di “Hey EC” para llamar. Pídele crear una tarea y decide título y descripción.",
  connecting: "Conectando con GPT Realtime…",
  live: "En llamada. Di “Thanks EC” para colgar, o se cierra a los 8 s de silencio.",
  error: "No se pudo conectar. Revisa el micrófono y la API key.",
} as const

const loadSavedVoice = (): RealtimeVoice => {
  const saved = localStorage.getItem(VOICE_STORAGE_KEY)
  return saved && isRealtimeVoice(saved) ? saved : DEFAULT_VOICE
}

export const DashboardPage = () => {
  const { user, logout } = useAuth()
  const { theme } = useTheme()
  const { status, error, start, hangUp, audioRef, localStream, remoteStream, busy, hearingUser } =
    useRealtimeVoice()
  const voiceLevel = useAudioLevel(status === "live" ? remoteStream : null)
  const userLevel = useAudioLevel(status === "live" ? localStream : null)
  const [voice, setVoice] = useState<RealtimeVoice>(DEFAULT_VOICE)
  const live = status === "live"
  const selectingLocked = status === "connecting" || live

  useEffect(() => {
    setVoice(loadSavedVoice())
  }, [])

  useSilenceHangup(live, userLevel, voiceLevel, hangUp, busy || hearingUser)

  useSpeechCommands({
    enabled: status === "idle" || status === "error",
    listenForWake: true,
    listenForHangup: false,
    onWake: () => {
      void start(voice, user?.name ?? "")
    },
    onHangup: hangUp,
  })

  const onVoiceChange = (value: string) => {
    if (!isRealtimeVoice(value)) {
      return
    }
    setVoice(value)
    localStorage.setItem(VOICE_STORAGE_KEY, value)
  }

  return (
    <main className="flex min-h-svh flex-col gap-8 bg-background p-6 py-10">
      <audio ref={audioRef} autoPlay playsInline />
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Hola, {user?.name}.</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-xl border bg-card p-8 text-center">
        <AnimatePresence>
          {live || status === "connecting" ? (
            <motion.div
              key="orb"
              className="w-full overflow-hidden"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 256 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 110, damping: 18, mass: 0.8 }}
            >
              <motion.div
                className="relative h-64 w-full"
                initial={{ scale: 0.55, filter: "blur(18px)", opacity: 0 }}
                animate={{ scale: 1, filter: "blur(0px)", opacity: 1 }}
                exit={{ scale: 0.7, filter: "blur(14px)", opacity: 0 }}
                transition={{ type: "spring", stiffness: 90, damping: 16, mass: 0.85 }}
              >
                <Orb
                  hue={270}
                  hoverIntensity={0.22}
                  rotateOnHover
                  forceHoverState={live}
                  voiceLevel={voiceLevel}
                  backgroundColor={theme === "dark" ? "#1a1a1a" : "#ffffff"}
                />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="grid w-full gap-2 text-left">
          <Label htmlFor="voice">Voz</Label>
          <Select value={voice} onValueChange={onVoiceChange} disabled={selectingLocked}>
            <SelectTrigger id="voice" className="w-full">
              <SelectValue placeholder="Elige una voz" />
            </SelectTrigger>
            <SelectContent>
              {VOICE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectingLocked ? (
            <p className="text-xs text-muted-foreground">
              La voz se aplica al iniciar la llamada. Cuelga para cambiarla.
            </p>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">{statusLabel[status]}</p>
        <p className="text-xs text-muted-foreground">
          Activar: Hey EC (jei isi). Colgar: Thanks EC (zenks isi) o 8 s de silencio.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {live ? (
          <Button type="button" variant="destructive" size="lg" onClick={hangUp}>
            <PhoneOff data-icon="inline-start" />
            Colgar
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            onClick={() => start(voice, user?.name ?? "")}
            disabled={status === "connecting"}
          >
            <Mic data-icon="inline-start" />
            {status === "connecting" ? "Conectando…" : "Hablar"}
          </Button>
        )}
      </div>

      <TaskBoard />

      <Button type="button" variant="outline" className="self-center" onClick={logout}>
        Cerrar sesión
      </Button>
    </main>
  )
}
