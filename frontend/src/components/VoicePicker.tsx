import { useEffect, useRef, useState } from "react"
import { AudioLines, Check, Loader2 } from "lucide-react"
import { registerVoicePreviewStop, setAudioSessionType } from "@/audio/audioSession"
import { prefetchVoicePreviews, previewVoice } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useVoiceAssistant } from "@/lib/voice-assistant"
import { VOICE_OPTIONS, type RealtimeVoice } from "@/lib/voices"
import { cn } from "@/lib/utils"

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "ahí"

export const VoicePicker = () => {
  const { user } = useAuth()
  const { voice, setVoice, selectingLocked } = useVoiceAssistant()
  const [previewing, setPreviewing] = useState<RealtimeVoice | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const playIdRef = useRef(0)

  const name = firstName(user?.name ?? "")

  useEffect(() => {
    prefetchVoicePreviews(name)
    return () => {
      audioRef.current?.pause()
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [name])

  useEffect(() => {
    const stop = () => {
      playIdRef.current += 1
      audioRef.current?.pause()
      setPreviewing(null)
      setAudioSessionType("auto")
    }
    registerVoicePreviewStop(stop)
    return () => registerVoicePreviewStop(undefined)
  }, [])

  useEffect(() => {
    if (!selectingLocked) {
      return
    }
    playIdRef.current += 1
    audioRef.current?.pause()
    setPreviewing(null)
  }, [selectingLocked])

  const playPreview = async (nextVoice: RealtimeVoice) => {
    const playId = playIdRef.current + 1
    playIdRef.current = playId
    audioRef.current?.pause()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    setPreviewing(nextVoice)

    try {
      const blob = await previewVoice(nextVoice, name)
      if (playId !== playIdRef.current) {
        return
      }
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setPreviewing((current) => (current === nextVoice ? null : current))
        setAudioSessionType("auto")
      }
      await audio.play()
      if (playId === playIdRef.current) {
        setPreviewing((current) => (current === nextVoice ? null : current))
      }
    } catch {
      setAudioSessionType("auto")
      if (playId === playIdRef.current) {
        setPreviewing(null)
      }
    }
  }

  const onSelect = (nextVoice: RealtimeVoice) => {
    setVoice(nextVoice)
    void playPreview(nextVoice)
  }

  return (
    <div className="grid gap-2">
      {VOICE_OPTIONS.map((option) => {
        const selected = voice === option.value
        const isPreviewing = previewing === option.value
        return (
          <button
            key={option.value}
            type="button"
            disabled={selectingLocked}
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all",
              selected
                ? "border-primary bg-primary/8 shadow-sm"
                : "border-border/80 bg-card hover:bg-muted/60",
              selectingLocked && "opacity-60",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-2xl",
                selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {isPreviewing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <AudioLines className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1 font-medium">{option.label}</span>
            {selected ? <Check className="size-4 text-primary" /> : null}
          </button>
        )
      })}
      {selectingLocked ? (
        <p className="px-1 text-xs text-muted-foreground">Cuelga la llamada para cambiar la voz.</p>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">Al elegir una voz escucharás un saludo de prueba.</p>
      )}
    </div>
  )
}
