import { useCallback, useRef, useState } from "react"
import type { AssistantMessage, ChatDeltaSource } from "@/lib/assistantChatEvents"
import type { AssistantChatController } from "@/lib/assistantChatEvents"

export const useAssistantChatMessages = () => {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const responseToMessageRef = useRef(new Map<string, string>())
  const responseBuffersRef = useRef(new Map<string, string>())
  const finalizedResponsesRef = useRef(new Set<string>())
  const textChannelResponsesRef = useRef(new Set<string>())
  /** Tras una tarjeta de datos (tabla), no mostrar la transcripción de voz de esa respuesta. */
  const skipNextVoiceRef = useRef(false)
  const mutedResponseIdsRef = useRef(new Set<string>())

  const clearVoiceSkip = useCallback(() => {
    skipNextVoiceRef.current = false
    mutedResponseIdsRef.current.clear()
  }, [])

  const resetMessages = useCallback(() => {
    responseToMessageRef.current.clear()
    responseBuffersRef.current.clear()
    finalizedResponsesRef.current.clear()
    textChannelResponsesRef.current.clear()
    clearVoiceSkip()
    setMessages([])
  }, [clearVoiceSkip])

  const muteResponse = useCallback((responseId: string) => {
    if (!responseId) {
      return false
    }
    if (skipNextVoiceRef.current) {
      mutedResponseIdsRef.current.add(responseId)
      skipNextVoiceRef.current = false
    }
    return mutedResponseIdsRef.current.has(responseId)
  }, [])

  const dropMutedResponse = useCallback((responseId: string) => {
    mutedResponseIdsRef.current.delete(responseId)
    responseBuffersRef.current.delete(responseId)
    textChannelResponsesRef.current.delete(responseId)
    const messageId = responseToMessageRef.current.get(responseId)
    responseToMessageRef.current.delete(responseId)
    finalizedResponsesRef.current.add(responseId)
    if (messageId) {
      setMessages((current) => current.filter((message) => message.id !== messageId))
    }
  }, [])

  const ensureMessage = useCallback((responseId: string) => {
    const existing = responseToMessageRef.current.get(responseId)
    if (existing) {
      return existing
    }

    const messageId = crypto.randomUUID()
    responseToMessageRef.current.set(responseId, messageId)
    setMessages((current) => [
      ...current,
      { id: messageId, text: "", streaming: true, createdAt: Date.now() },
    ])
    return messageId
  }, [])

  const resetResponseBuffer = useCallback((responseId: string) => {
    responseBuffersRef.current.set(responseId, "")
    const messageId = responseToMessageRef.current.get(responseId)
    if (!messageId) {
      return
    }
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, text: "" } : message)),
    )
  }, [])

  const appendDelta = useCallback(
    (responseId: string, delta: string, source: ChatDeltaSource) => {
      if (!responseId || !delta || finalizedResponsesRef.current.has(responseId)) {
        return
      }

      if (muteResponse(responseId)) {
        return
      }

      if (source === "text") {
        if (!textChannelResponsesRef.current.has(responseId)) {
          textChannelResponsesRef.current.add(responseId)
          resetResponseBuffer(responseId)
        }
      } else if (textChannelResponsesRef.current.has(responseId)) {
        return
      }

      const messageId = ensureMessage(responseId)
      const buffered = `${responseBuffersRef.current.get(responseId) ?? ""}${delta}`
      responseBuffersRef.current.set(responseId, buffered)

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, text: message.text + delta } : message,
        ),
      )
    },
    [ensureMessage, muteResponse, resetResponseBuffer],
  )

  const finalize = useCallback(
    (responseId: string, finalText?: string, source?: ChatDeltaSource) => {
      if (!responseId || finalizedResponsesRef.current.has(responseId)) {
        return
      }

      if (muteResponse(responseId) || mutedResponseIdsRef.current.has(responseId)) {
        dropMutedResponse(responseId)
        return
      }

      // Había tabla pendiente y esta respuesta no trajo deltas: igual no duplicar.
      if (skipNextVoiceRef.current) {
        skipNextVoiceRef.current = false
        dropMutedResponse(responseId)
        return
      }

      if (source === "transcript" && textChannelResponsesRef.current.has(responseId)) {
        return
      }

      if (source === "text") {
        textChannelResponsesRef.current.add(responseId)
      }

      const buffered = responseBuffersRef.current.get(responseId) ?? ""
      const text = (finalText ?? buffered).trim()
      const messageId = responseToMessageRef.current.get(responseId)

      responseBuffersRef.current.delete(responseId)
      responseToMessageRef.current.delete(responseId)
      textChannelResponsesRef.current.delete(responseId)

      if (!text && !messageId) {
        return
      }

      finalizedResponsesRef.current.add(responseId)

      setMessages((current) => {
        if (!messageId) {
          if (!text) {
            return current
          }
          return [...current, { id: crypto.randomUUID(), text, streaming: false, createdAt: Date.now() }]
        }

        return current
          .map((message) =>
            message.id === messageId
              ? { ...message, text: text || message.text.trim(), streaming: false }
              : message,
          )
          .filter((message) => message.text.trim() || message.attachment)
      })
    },
    [dropMutedResponse, muteResponse],
  )

  const appendPdfReport = useCallback(
    (report: { url: string; fileName: string; title: string }) => {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          text: `Reporte listo: ${report.title}`,
          streaming: false,
          createdAt: Date.now(),
          attachment: {
            type: "pdf",
            url: report.url,
            fileName: report.fileName,
            title: report.title,
          },
        },
      ])
      skipNextVoiceRef.current = true
    },
    [],
  )

  const appendMarkdownMessage = useCallback((markdown: string) => {
    const text = markdown.trim()
    if (!text) {
      return
    }
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        text,
        streaming: false,
        createdAt: Date.now(),
      },
    ])
    // La siguiente respuesta hablada no se duplica en el chat: ya está la tabla/lista.
    skipNextVoiceRef.current = true
  }, [])

  const controllerRef = useRef<AssistantChatController>({ appendDelta, finalize })

  controllerRef.current.appendDelta = appendDelta
  controllerRef.current.finalize = finalize

  return {
    messages,
    resetMessages,
    appendPdfReport,
    appendMarkdownMessage,
    clearVoiceSkip,
    chatController: controllerRef,
  }
}
