import { useEffect, useState } from "react"

export const useHideOnScroll = (resetKey?: string) => {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(false)
    let lastY = window.scrollY
    let ticking = false

    const onScroll = (event: Event) => {
      if (ticking) {
        return
      }
      ticking = true
      window.requestAnimationFrame(() => {
        const target = event.target
        const y =
          target instanceof HTMLElement &&
          target !== document.documentElement &&
          target !== document.body &&
          target.scrollHeight > target.clientHeight + 8
            ? target.scrollTop
            : window.scrollY
        const delta = y - lastY
        if (y < 20) {
          setHidden(false)
        } else if (delta > 8) {
          setHidden(true)
        } else if (delta < -8) {
          setHidden(false)
        }
        lastY = y
        ticking = false
      })
    }

    window.addEventListener("scroll", onScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true })
    }
  }, [resetKey])

  return hidden
}
