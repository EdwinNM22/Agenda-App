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
import { useAudioLevel } from "@/hooks/useAudioLevel"
import {
  useRealtimeVoice,
  type AssistantMessage,
  type TextChatStatus,
  type ToolActivity,
  type VoiceStatus,
} from "@/hooks/useRealtimeVoice"
import { useConversationTitle } from "@/hooks/useConversationTitle"
import { useSilenceHangup } from "@/hooks/useSilenceHangup"
import {
  DEFAULT_VOICE,
  isRealtimeVoice,
  type RealtimeVoice,
} from "@/lib/voices"

const VOICE_STORAGE_KEY = "agenda.realtimeVoice"

type VoiceAssistantContextValue = {
  status: VoiceStatus
  textStatus: TextChatStatus
  error: string | null
  start: (voice?: RealtimeVoice) => Promise<void>
  sendText: (text: string) => Promise<void>
  hangUp: () => void
  audioRef: RefObject<HTMLAudioElement | null>
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  busy: boolean
  hearingUser: boolean
  activity: ToolActivity
  messages: AssistantMessage[]
  conversationTitle: string | null
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
  const {
    status,
    textStatus,
    error,
    start: startSession,
    sendText: sendTextSession,
    hangUp,
    audioRef,
    localStream,
    remoteStream,
    busy,
    hearingUser,
    activity,
    messages,
  } = useRealtimeVoice()
  const conversationTitle = useConversationTitle(messages)
  const voiceLevel = useAudioLevel(remoteStream)
  const userLevel = useAudioLevel(localStream)
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
      await startSession(nextVoice ?? voice)
    },
    [startSession, voice],
  )

  const sendText = useCallback(
    async (text: string) => {
      await sendTextSession(text)
    },
    [sendTextSession],
  )

  useSilenceHangup(live, userLevel, voiceLevel, hangUp, busy || hearingUser)

  const value = useMemo(
    () => ({
      status,
      textStatus,
      error,
      start,
      sendText,
      hangUp,
      audioRef,
      localStream,
      remoteStream,
      busy,
      hearingUser,
      activity,
      messages,
      conversationTitle,
      voiceLevel,
      userLevel,
      voice,
      setVoice,
      live,
      selectingLocked,
    }),
    [
      status,
      textStatus,
      error,
      start,
      sendText,
      hangUp,
      audioRef,
      localStream,
      remoteStream,
      busy,
      hearingUser,
      activity,
      messages,
      conversationTitle,
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
      <audio ref={audioRef} autoPlay={false} playsInline preload="auto" />
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
