import { registerSW } from "virtual:pwa-register"

type NavigatorStandalone = Navigator & { standalone?: boolean }

export const isStandalone = (): boolean => {
  if (typeof window === "undefined") {
    return false
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    Boolean((navigator as NavigatorStandalone).standalone)
  )
}

export const isIos = (): boolean => {
  if (typeof navigator === "undefined") {
    return false
  }
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
}

const persistStorage = () => {
  void navigator.storage?.persist?.().catch(() => undefined)
}

const keepSameOriginBlankLinksInPwa = () => {
  document.addEventListener("click", (event) => {
    if (!isStandalone() || event.defaultPrevented) {
      return
    }
    const anchor = event.target instanceof Element ? event.target.closest("a") : null
    if (!anchor?.href || anchor.hasAttribute("download") || anchor.target !== "_blank") {
      return
    }
    let url: URL
    try {
      url = new URL(anchor.href, window.location.href)
    } catch {
      return
    }
    if (url.origin !== window.location.origin) {
      return
    }
    event.preventDefault()
    window.location.assign(url.href)
  })
}

const bindVisualViewport = () => {
  const root = document.documentElement
  const sync = () => {
    const viewport = window.visualViewport
    const keyboard = viewport
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0
    root.style.setProperty("--keyboard-inset", `${keyboard}px`)
    root.classList.toggle("keyboard-open", keyboard > 80)
  }
  window.visualViewport?.addEventListener("resize", sync)
  window.visualViewport?.addEventListener("scroll", sync)
  window.addEventListener("orientationchange", sync)
  sync()
}

const markDisplayMode = () => {
  const root = document.documentElement
  const standalone = isStandalone()
  root.classList.toggle("pwa-standalone", standalone)
  root.classList.toggle("pwa-ios", isIos() && standalone)
}

export const bootPwa = () => {
  markDisplayMode()
  persistStorage()
  keepSameOriginBlankLinksInPwa()
  bindVisualViewport()
  window.matchMedia("(display-mode: standalone)").addEventListener("change", markDisplayMode)

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) {
        return
      }
      window.setInterval(() => {
        void registration.update()
      }, 60 * 60 * 1000)
    },
  })
}
