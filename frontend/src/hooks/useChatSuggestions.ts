import { useEffect, useRef, useState } from "react"
import type { AssistantMessage } from "@/lib/assistantChatEvents"
import type { ChatFollowUpSuggestion } from "@/lib/chatSuggestions"
import { api } from "@/lib/api"

const toTranscript = (messages: AssistantMessage[]) =>
  messages
    .filter((message) => message.text.trim() && !message.streaming)
    .map((message) => ({
      role: (message.role === "user" ? "user" : "assistant") as "user" | "assistant",
      text: message.text.trim(),
    }))

const lastAssistantKey = (messages: AssistantMessage[]) => {
  const last = messages.filter((m) => !m.streaming).at(-1)
  if (!last || last.role === "user") {
    return ""
  }
  return `${last.id}:${last.text.length}:${last.createdAt}`
}

const normalizeSuggestions = (raw: unknown): ChatFollowUpSuggestion[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: ChatFollowUpSuggestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue
    }
    const label = typeof item.label === "string" ? item.label.trim() : ""
    const message = typeof item.message === "string" ? item.message.trim() : ""
    if (!label || !message) {
      continue
    }
    out.push({ label, message })
    if (out.length >= 4) {
      break
    }
  }
  return out.length >= 2 ? out : []
}

type UseChatSuggestionsOptions = {
  enabled: boolean
}

export const useChatSuggestions = (
  messages: AssistantMessage[],
  { enabled }: UseChatSuggestionsOptions,
) => {
  const [suggestions, setSuggestions] = useState<ChatFollowUpSuggestion[]>([])
  const fetchIdRef = useRef(0)
  const lastKeyRef = useRef("")

  const clearSuggestions = () => {
    fetchIdRef.current += 1
    lastKeyRef.current = ""
    setSuggestions([])
  }

  useEffect(() => {
    if (!enabled) {
      setSuggestions([])
      return
    }

    const transcript = toTranscript(messages)
    const last = transcript.at(-1)
    if (!last || last.role !== "assistant") {
      setSuggestions([])
      return
    }

    const key = lastAssistantKey(messages)
    if (!key || key === lastKeyRef.current) {
      return
    }

    if (!transcript.some((turn) => turn.role === "user")) {
      setSuggestions([])
      return
    }

    lastKeyRef.current = key
    const fetchId = ++fetchIdRef.current
    setSuggestions([])

    void api<{ suggestions: ChatFollowUpSuggestion[] }>("/assistant/chat-suggestions", {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ messages: transcript }),
    })
      .then((data) => {
        if (fetchId !== fetchIdRef.current) {
          return
        }
        setSuggestions(normalizeSuggestions(data.suggestions))
      })
      .catch(() => {
        if (fetchId === fetchIdRef.current) {
          setSuggestions([])
        }
      })
  }, [enabled, messages])

  return { suggestions, clearSuggestions }
}
