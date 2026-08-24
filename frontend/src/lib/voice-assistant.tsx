import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { useRealtimeVoice, type VoiceStatus } from "@/hooks/useRealtimeVoice"
import { useSilenceHangup } from "@/hooks/useSilenceHangup"
import { useAuth } from "@/lib/auth"
import {
  DEFAULT_VOICE,
  isRealtimeVoice,
  type RealtimeVoice,
} from "@/lib/voices"

const VOICE_STORAGE_KEY = "agenda.realtimeVoice"

type VoiceAssistantContextValue = {
  status: VoiceStatus
  error: string | null
  start: (voice?: RealtimeVoice) => Promise<void>
  hangUp: () => void
  audioRef: RefObject<HTMLAudioElement | null>
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  busy: boolean
  voiceLevel: number
  userLevel: number
  voice: RealtimeVoice
  setVoice: (voice: RealtimeVoice) => void
  live: boolean
  selectingLocked: boolean
}

const VoiceAssistantContext = createContext<VoiceAssistantContextValue | undefined>(undefined)

const loadSavedVoice = (): RealtimeVoice => {
  const saved = localStorage.getItem(VOICE_STORAGE_KEY)
  return saved && isRealtimeVoice(saved) ? saved : DEFAULT_VOICE
}

export const VoiceAssistantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const { status, error, start: startSession, hangUp, audioRef, localStream, remoteStream, busy, hearingUser } =
    useRealtimeVoice()
  const voiceLevel = 0
  const userLevel = 0
  const [voice, setVoiceState] = useState<RealtimeVoice>(DEFAULT_VOICE)
  const live = status === "live"
  const selectingLocked = status === "connecting" || live

  useEffect(() => {
    setVoiceState(loadSavedVoice())
  }, [])

  const setVoice = useCallback((next: RealtimeVoice) => {
    setVoiceState(next)
    localStorage.setItem(VOICE_STORAGE_KEY, next)
  }, [])

  const start = useCallback(
    async (nextVoice?: RealtimeVoice) => {
      await startSession(nextVoice ?? voice, user?.name ?? "")
    },
    [startSession, user?.name, voice],
  )

  useSilenceHangup(live, userLevel, voiceLevel, hangUp, busy || hearingUser)

  const value = useMemo(
    () => ({
      status,
      error,
      start,
      hangUp,
      audioRef,
      localStream,
      remoteStream,
      busy,
      voiceLevel,
      userLevel,
      voice,
      setVoice,
      live,
      selectingLocked,
    }),
    [
      status,
      error,
      start,
      hangUp,
      audioRef,
      localStream,
      remoteStream,
      busy,
      voiceLevel,
      userLevel,
      voice,
      setVoice,
      live,
      selectingLocked,
    ],
  )

  return (
    <VoiceAssistantContext.Provider value={value}>
      <audio ref={audioRef} autoPlay playsInline />
      {children}
    </VoiceAssistantContext.Provider>
  )
}

export const useVoiceAssistant = () => {
  const context = useContext(VoiceAssistantContext)
  if (!context) {
    throw new Error("useVoiceAssistant debe usarse dentro de VoiceAssistantProvider")
  }
  return context
}
