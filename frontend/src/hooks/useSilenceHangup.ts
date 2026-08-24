import { useEffect, useRef } from "react"

const SILENCE_MS = 30_000
const GRACE_MS = 15_000
const TICK_MS = 250
const USER_SPEECH = 0.12
const AI_SPEECH = 0.08

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

    const startedAt = Date.now()
    let lastVoiceAt = Date.now()
    const interval = window.setInterval(() => {
      const speaking =
        userLevelRef.current > USER_SPEECH || aiLevelRef.current > AI_SPEECH
      if (busyRef.current || speaking || Date.now() - startedAt < GRACE_MS) {
        lastVoiceAt = Date.now()
        return
      }
      if (Date.now() - lastVoiceAt >= SILENCE_MS) {
        onHangUpRef.current()
      }
    }, TICK_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [live])
}
