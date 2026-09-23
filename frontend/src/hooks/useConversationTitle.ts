import { useEffect, useRef, useState } from "react"
import type { AssistantMessage } from "@/lib/assistantChatEvents"
import { api } from "@/lib/api"

const fallbackTitle = (userText: string) => {
  const words = userText.trim().split(/\s+/).filter(Boolean).slice(0, 6)
  if (words.length === 0) {
    return "Nueva conversación"
  }
  const joined = words.join(" ")
  return joined.length > 42 ? `${joined.slice(0, 39)}…` : joined
}

export const useConversationTitle = (messages: AssistantMessage[]) => {
  const [title, setTitle] = useState<string | null>(null)
  const fetchIdRef = useRef(0)
  const lastPairRef = useRef("")

  useEffect(() => {
    const firstUser = messages.find((message) => message.role === "user" && message.text.trim())
    if (!firstUser) {
      setTitle(null)
      lastPairRef.current = ""
      return
    }

    setTitle((current) => current ?? fallbackTitle(firstUser.text))

    const firstAssistant = messages.find(
      (message) =>
        message.role !== "user" &&
        message.text.trim() &&
        !message.streaming,
    )
    if (!firstAssistant) {
      return
    }

    const pairKey = `${firstUser.id}:${firstAssistant.id}:${firstAssistant.text.length}`
    if (lastPairRef.current === pairKey) {
      return
    }
    lastPairRef.current = pairKey

    const fetchId = ++fetchIdRef.current
    void api<{ title: string }>("/assistant/conversation-title", {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({
        userText: firstUser.text,
        assistantText: firstAssistant.text,
      }),
    })
      .then((data) => {
        if (fetchId !== fetchIdRef.current) {
          return
        }
        const next = data.title?.trim()
        if (next) {
          setTitle(next)
        }
      })
      .catch(() => {
        /* fallback ya mostrado */
      })
  }, [messages])

  return title
}
