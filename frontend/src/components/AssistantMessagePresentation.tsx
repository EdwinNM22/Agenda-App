import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"
import { useTypewriterCatchUp } from "@/hooks/useTypewriterCatchUp"
import {
  isAssistantMessageRevealed,
  markAssistantMessageRevealed,
} from "@/lib/assistantMessageRevealed"

type AssistantMessagePresentationValue = {
  text: string
  typed: string
  running: boolean
  showShimmer: boolean
  showTypewriter: boolean
  showMarkdown: boolean
  showCaret: boolean
}

const AssistantMessagePresentationContext = createContext<AssistantMessagePresentationValue | null>(
  null,
)

export const AssistantMessagePresentationProvider = ({
  messageId,
  text,
  running,
  children,
}: {
  messageId: string
  text: string
  running: boolean
  children: ReactNode
}) => {
  const trimmed = text.trim()
  const alreadyRevealed = isAssistantMessageRevealed(messageId)
  const typed = useTypewriterCatchUp(text, messageId, 18, alreadyRevealed)
  const caughtUp = trimmed.length > 0 && typed.length >= text.length

  useEffect(() => {
    if (!running && trimmed && caughtUp) {
      markAssistantMessageRevealed(messageId)
    }
  }, [caughtUp, messageId, running, trimmed])

  useEffect(() => {
    return () => {
      if (!running && trimmed) {
        markAssistantMessageRevealed(messageId)
      }
    }
  }, [messageId, running, trimmed])

  const value = useMemo((): AssistantMessagePresentationValue => {
    const showShimmer = running && !trimmed
    const showMarkdown = alreadyRevealed
      ? trimmed.length > 0 && !running
      : caughtUp && !running
    const showTypewriter = trimmed.length > 0 && !showMarkdown
    const showCaret = showTypewriter && (!caughtUp || running)

    return {
      text,
      typed: alreadyRevealed ? text : typed,
      running,
      showShimmer,
      showTypewriter,
      showMarkdown,
      showCaret,
    }
  }, [alreadyRevealed, caughtUp, running, text, trimmed.length, typed])

  return (
    <AssistantMessagePresentationContext.Provider value={value}>
      {children}
    </AssistantMessagePresentationContext.Provider>
  )
}

export const useAssistantMessagePresentation = () => {
  const value = useContext(AssistantMessagePresentationContext)
  if (!value) {
    throw new Error("useAssistantMessagePresentation debe usarse dentro del provider")
  }
  return value
}
