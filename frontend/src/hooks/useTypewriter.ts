import { useEffect, useRef, useState } from "react"

/** Evita repetir la animación si Strict Mode remonta con el mismo texto en la misma carga. */
const animatedThisLoad = new Set<string>()

export const useTypewriter = (text: string, active: boolean, msPerChar = 22) => {
  const [display, setDisplay] = useState("")
  const completedTextRef = useRef("")

  useEffect(() => {
    if (!text) {
      completedTextRef.current = ""
      setDisplay("")
      return
    }

    if (!active) {
      if (completedTextRef.current === text || animatedThisLoad.has(text)) {
        setDisplay(text)
      }
      return
    }

    if (completedTextRef.current === text || animatedThisLoad.has(text)) {
      completedTextRef.current = text
      setDisplay(text)
      return
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (reduced) {
      completedTextRef.current = text
      animatedThisLoad.add(text)
      setDisplay(text)
      return
    }

    setDisplay("")
    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setDisplay(text.slice(0, index))
      if (index >= text.length) {
        completedTextRef.current = text
        animatedThisLoad.add(text)
        window.clearInterval(timer)
      }
    }, msPerChar)

    return () => {
      window.clearInterval(timer)
    }
  }, [active, msPerChar, text])

  return display
}
