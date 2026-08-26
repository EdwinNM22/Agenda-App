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

export const isSafari = (): boolean => {
  if (typeof navigator === "undefined") {
    return false
  }
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|FxiOS|EdgiOS|Edg\//i.test(ua)
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

let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined
let registrationRef: ServiceWorkerRegistration | null = null
let updateAvailable = false
const updateListeners = new Set<() => void>()

const notifyUpdateListeners = () => {
  updateListeners.forEach((listener) => listener())
}

export const pwaHasUpdate = () => updateAvailable

export const subscribePwaUpdate = (listener: () => void) => {
  updateListeners.add(listener)
  return () => {
    updateListeners.delete(listener)
  }
}

export const checkPwaUpdate = async () => {
  await registrationRef?.update()
}

export const applyPwaUpdate = async () => {
  if (applyUpdate) {
    await applyUpdate(true)
    return
  }
  window.location.reload()
}

export const getPwaRegistration = async () => {
  if (registrationRef?.pushManager) {
    return registrationRef
  }
  if (!("serviceWorker" in navigator)) {
    return null
  }
  const fromReady = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000)),
  ])
  if (fromReady?.pushManager) {
    registrationRef = fromReady
    return fromReady
  }
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) {
    registrationRef = existing
    return existing
  }
  return registrationRef
}

export const bootPwa = () => {
  markDisplayMode()
  persistStorage()
  keepSameOriginBlankLinksInPwa()
  bindVisualViewport()
  window.matchMedia("(display-mode: standalone)").addEventListener("change", markDisplayMode)

  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateAvailable = true
      notifyUpdateListeners()
    },
    onRegisteredSW(url, registration) {
      console.info("[avisos] service worker registrado", {
        url,
        scope: registration?.scope,
        active: registration?.active?.state ?? null,
        pushManager: Boolean(registration?.pushManager),
      })
      registrationRef = registration ?? null
      const check = () => {
        void registration?.update()
      }
      check()
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          check()
        }
      })
      window.addEventListener("pageshow", check)
      window.addEventListener("focus", check)
      window.setInterval(check, 5 * 60 * 1000)
    },
  })
}
