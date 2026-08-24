import { useEffect, useRef } from "react"
import { isHangupCommand, isWakeCommand } from "@/lib/voiceCommands"

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

const SpeechRecognitionApi = (): SpeechRecognitionCtor | null => {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

type UseSpeechCommandsOptions = {
  enabled: boolean
  listenForWake: boolean
  listenForHangup: boolean
  onWake: () => void
  onHangup: () => void
}

export const useSpeechCommands = ({
  enabled,
  listenForWake,
  listenForHangup,
  onWake,
  onHangup,
}: UseSpeechCommandsOptions) => {
  const onWakeRef = useRef(onWake)
  const onHangupRef = useRef(onHangup)
  onWakeRef.current = onWake
  onHangupRef.current = onHangup

  useEffect(() => {
    if (!enabled || (!listenForWake && !listenForHangup)) {
      return
    }

    const Recognition = SpeechRecognitionApi()
    if (!Recognition) {
      return
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "es-MX"

    let stopped = false
    let coolingDown = false
    let recent = ""

    const trigger = (kind: "wake" | "hangup") => {
      if (coolingDown) {
        return
      }
      coolingDown = true
      window.setTimeout(() => {
        coolingDown = false
      }, 2500)
      if (kind === "wake") {
        onWakeRef.current()
      } else {
        onHangupRef.current()
      }
    }

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (!result) {
          continue
        }
        const transcript = result[0]?.transcript ?? ""
        recent = `${recent} ${transcript}`.trim().slice(-160)
        if (listenForWake && (isWakeCommand(transcript) || isWakeCommand(recent))) {
          recent = ""
          trigger("wake")
          return
        }
        if (listenForHangup && (isHangupCommand(transcript) || isHangupCommand(recent))) {
          recent = ""
          trigger("hangup")
        }
      }
    }

    recognition.onend = () => {
      if (!stopped) {
        try {
          recognition.start()
        } catch {
          // already started
        }
      }
    }

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopped = true
      }
    }

    try {
      recognition.start()
    } catch {
      // already started
    }

    return () => {
      stopped = true
      recognition.onend = null
      recognition.onresult = null
      recognition.onerror = null
      try {
        recognition.abort()
      } catch {
        // ignore
      }
    }
  }, [enabled, listenForWake, listenForHangup])
}
