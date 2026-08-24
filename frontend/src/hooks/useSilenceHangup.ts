import { useEffect, useRef } from "react"

const SILENCE_MS = 8000
const CHECK_EVERY_MS = 250
const USER_SPEECH = 0.2
const AI_SPEECH = 0.12

export const useSilenceHangup = (
  live: boolean,
  userLevel: number,
  aiLevel: number,
  onHangUp: () => void,
  busy = false,
) => {
  const onHangUpRef = useRef(onHangUp)
  const userLevelRef = useRef(userLevel)
  const aiLevelRef = useRef(aiLevel)
  const busyRef = useRef(busy)
  onHangUpRef.current = onHangUp
  userLevelRef.current = userLevel
  aiLevelRef.current = aiLevel
  busyRef.current = busy

  useEffect(() => {
    if (!live) {
      return
    }

    let lastVoiceAt = Date.now()
    const interval = window.setInterval(() => {
      const speaking =
        userLevelRef.current > USER_SPEECH || aiLevelRef.current > AI_SPEECH
      if (busyRef.current || speaking) {
        lastVoiceAt = Date.now()
        return
      }
      if (Date.now() - lastVoiceAt >= SILENCE_MS) {
        onHangUpRef.current()
      }
    }, CHECK_EVERY_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [live])
}
