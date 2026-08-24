import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { updateProfile, uploadWallpaper } from "@/lib/api"
import { useAuth } from "@/lib/auth"

export type Theme = "light" | "dark" | "wallpaper"

export type WallpaperFrame = {
  x: number
  y: number
  zoom: number
}

type ThemeContextValue = {
  theme: Theme
  wallpaper: string | null
  wallpaperColor: string | null
  frame: WallpaperFrame
  setTheme: (theme: Theme) => void
  setWallpaper: (file: File, frame?: WallpaperFrame) => Promise<void>
  setWallpaperFrame: (frame: WallpaperFrame) => Promise<void>
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const defaultFrame = (): WallpaperFrame => ({ x: 50, y: 50, zoom: 1 })

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

const applyThemeColor = (color: string) => {
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement("meta")
    meta.setAttribute("name", "theme-color")
    document.head.appendChild(meta)
  }
  meta.setAttribute("content", color)
}

const applyChrome = (theme: Theme, wallpaper: string | null, color: string | null = null) => {
  const root = document.documentElement
  const useDark = theme !== "light"
  const useWallpaper = theme === "wallpaper" && Boolean(wallpaper)
  root.classList.toggle("dark", useDark)
  root.classList.toggle("wallpaper", useWallpaper)
  localStorage.setItem("agenda.theme", theme)
  if (useWallpaper && color) {
    root.style.setProperty("--wallpaper-color", color)
    localStorage.setItem("agenda.wallpaperColor", color)
    applyThemeColor(color)
    return
  }
  root.style.removeProperty("--wallpaper-color")
  localStorage.removeItem("agenda.wallpaperColor")
  applyThemeColor(useDark ? "#0a0a0a" : "#ffffff")
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading, setUser } = useAuth()
  const [theme, setThemeState] = useState<Theme>("light")
  const [wallpaper, setWallpaperState] = useState<string | null>(null)
  const [wallpaperColor, setWallpaperColor] = useState<string | null>(null)
  const [frame, setFrameState] = useState<WallpaperFrame>(defaultFrame)

  useEffect(() => {
    if (loading) {
      return
    }
    if (!user) {
      const fallback = systemTheme()
      setThemeState(fallback)
      setWallpaperState(null)
      setWallpaperColor(null)
      setFrameState(defaultFrame())
      applyChrome(fallback, null)
      return
    }
    const nextTheme =
      user.theme === "wallpaper" && !user.wallpaperUrl ? "dark" : user.theme
    const nextFrame = {
      x: user.wallpaperX ?? 50,
      y: user.wallpaperY ?? 50,
      zoom: user.wallpaperZoom ?? 1,
    }
    setThemeState(nextTheme)
    setWallpaperState(user.wallpaperUrl)
    setWallpaperColor(user.wallpaperColor)
    setFrameState(nextFrame)
    applyChrome(nextTheme, user.wallpaperUrl, user.wallpaperColor)
  }, [loading, user])

  const setTheme = useCallback(
    (next: Theme) => {
      if (next === "wallpaper" && !wallpaper && !user?.wallpaperUrl) {
        return
      }
      const image = next === "wallpaper" ? wallpaper ?? user?.wallpaperUrl ?? null : wallpaper
      setThemeState(next)
      applyChrome(next, image, user?.wallpaperColor ?? null)
      if (!user) {
        return
      }
      void updateProfile({ theme: next })
        .then((data) => setUser(data.user))
        .catch(() => undefined)
    },
    [user, wallpaper, setUser],
  )

  const setWallpaper = useCallback(
    async (file: File, nextFrame: WallpaperFrame = defaultFrame()) => {
      const data = await uploadWallpaper(file, nextFrame)
      setUser(data.user)
      setThemeState("wallpaper")
      setWallpaperState(data.user.wallpaperUrl)
      setWallpaperColor(data.user.wallpaperColor)
      setFrameState({
        x: data.user.wallpaperX,
        y: data.user.wallpaperY,
        zoom: data.user.wallpaperZoom,
      })
      applyChrome("wallpaper", data.user.wallpaperUrl, data.user.wallpaperColor)
    },
    [setUser],
  )

  const setWallpaperFrame = useCallback(
    async (nextFrame: WallpaperFrame) => {
      setFrameState(nextFrame)
      if (!user) {
        return
      }
      const data = await updateProfile({
        theme: "wallpaper",
        wallpaperX: nextFrame.x,
        wallpaperY: nextFrame.y,
        wallpaperZoom: nextFrame.zoom,
      })
      setUser(data.user)
    },
    [setUser, user],
  )

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [setTheme, theme])

  const value = useMemo(
    () => ({ theme, wallpaper, wallpaperColor, frame, setTheme, setWallpaper, setWallpaperFrame, toggleTheme }),
    [theme, wallpaper, wallpaperColor, frame, setTheme, setWallpaper, setWallpaperFrame, toggleTheme],
  )

  return (
    <ThemeContext.Provider value={value}>
      {typeof document !== "undefined" && theme === "wallpaper" && wallpaper
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
              style={{ width: "100vw", height: "100dvh" }}
              aria-hidden
            >
              <img
                src={wallpaper}
                alt=""
                className="absolute inset-0 size-full object-cover"
                style={{
                  objectPosition: `${frame.x}% ${frame.y}%`,
                  transform: `scale(${frame.zoom})`,
                }}
              />
              <div className="absolute inset-0 bg-black/30" />
            </div>,
            document.body,
          )
        : null}
      <div className="relative z-10">{children}</div>
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme debe usarse dentro de ThemeProvider")
  }
  return context
}
