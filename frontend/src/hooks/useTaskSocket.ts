import { useEffect, useState } from "react"
import { wsUrl } from "@/lib/apiBase"
import { parseTaskSocketEvent, type TaskSocketEvent } from "@/lib/taskSocket"

export const useTaskSocket = (onEvent: (event: TaskSocketEvent) => void) => {
  const [live, setLive] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      return
    }

    let socket: WebSocket | null = null
    let closed = false
    let retries = 0
    let reconnectTimer = 0
    let pingTimer = 0

    const connect = () => {
      if (closed) {
        return
      }
      const url = wsUrl(`/ws/tasks?token=${encodeURIComponent(token)}`)
      socket = new WebSocket(url)

      socket.onopen = () => {
        retries = 0
        setLive(true)
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }))
          }
        }, 25000)
      }

      socket.onmessage = (message) => {
        const event = parseTaskSocketEvent(message.data)
        if (event && event.type !== "pong") {
          onEvent(event)
        }
      }

      socket.onclose = () => {
        setLive(false)
        window.clearInterval(pingTimer)
        if (closed) {
          return
        }
        retries = Math.min(retries + 1, 6)
        reconnectTimer = window.setTimeout(connect, 1000 * retries)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        return
      }
      if (socket && socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) {
        socket.close()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", onVisible)

    return () => {
      closed = true
      window.clearTimeout(reconnectTimer)
      window.clearInterval(pingTimer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", onVisible)
      socket?.close()
    }
  }, [onEvent])

  return live
}
