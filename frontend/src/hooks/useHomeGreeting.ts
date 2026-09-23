import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { api } from "@/lib/api"

const fallbackFor = (userName: string) => {
  const firstName = userName.trim().split(/\s+/)[0] ?? ""
  return firstName ? `¡Hola, ${firstName}! ¿En qué te ayudo hoy?` : "¡Hola! ¿En qué te ayudo hoy?"
}

export const useHomeGreeting = (userId: number | undefined, userName: string) => {
  const { pathname } = useLocation()
  const onHome = pathname === "/"
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const [greeting, setGreeting] = useState("")
  const [loading, setLoading] = useState(false)

  const inflightRef = useRef<Promise<string> | null>(null)
  const requestIdRef = useRef(0)
  const greetingRef = useRef("")

  const fetchGreeting = useCallback(async (): Promise<string> => {
    const fallback = fallbackFor(userName)
    if (!userId) {
      return fallback
    }

    if (inflightRef.current) {
      return inflightRef.current
    }

    const request = api<{ greeting: string }>("/assistant/home-greeting", {
      cache: "no-store",
    })
      .then((data) => data.greeting?.trim() || fallback)
      .catch(() => fallback)
      .finally(() => {
        if (inflightRef.current === request) {
          inflightRef.current = null
        }
      })

    inflightRef.current = request
    return request
  }, [userId, userName])

  const loadGreeting = useCallback(
    async (mode: "initial" | "refresh") => {
      const fallback = fallbackFor(userName)
      if (!userId) {
        greetingRef.current = fallback
        setGreeting(fallback)
        setLoading(false)
        return
      }

      const requestId = ++requestIdRef.current
      const hadGreeting = greetingRef.current.length > 0
      const showShimmer = mode === "initial" || !hadGreeting

      if (showShimmer) {
        greetingRef.current = ""
        setGreeting("")
        setLoading(true)
      }

      const next = await fetchGreeting()
      if (requestId !== requestIdRef.current) {
        return
      }

      greetingRef.current = next
      setGreeting(next)
      setLoading(false)
    },
    [fetchGreeting, userId, userName],
  )

  useEffect(() => {
    if (!onHome) {
      return
    }
    void loadGreeting("initial")
  }, [onHome, loadGreeting])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && pathnameRef.current === "/") {
        void loadGreeting("refresh")
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [loadGreeting])

  return { greeting, loading }
}
