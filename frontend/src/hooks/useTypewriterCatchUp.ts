import { useEffect, useRef, useState } from "react"

/** Escribe hasta alcanzar `text`; sigue si el stream crece. `resetKey` reinicia (p. ej. id de mensaje). */
export const useTypewriterCatchUp = (
  text: string,
  resetKey: string,
  msPerChar = 18,
  skipAnimation = false,
) => {
  const [len, setLen] = useState(0)
  const textRef = useRef(text)
  textRef.current = text
  const resetKeyRef = useRef(resetKey)

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey
      setLen(0)
    }
  }, [resetKey])

  useEffect(() => {
    if (!text) {
      setLen(0)
      return
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (reduced || skipAnimation) {
      setLen(text.length)
      return
    }

    const timer = window.setInterval(() => {
      setLen((current) => {
        const target = textRef.current.length
        if (current >= target) {
          return current
        }
        return current + 1
      })
    }, msPerChar)

    return () => {
      window.clearInterval(timer)
    }
  }, [msPerChar, resetKey, skipAnimation, text])

  return text.slice(0, len)
}
