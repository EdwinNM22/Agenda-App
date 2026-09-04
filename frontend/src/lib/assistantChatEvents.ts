export type AssistantPdfAttachment = {
  type: "pdf"
  url: string
  fileName: string
  title: string
}

export type AssistantMessage = {
  id: string
  text: string
  streaming: boolean
  createdAt: number
  attachment?: AssistantPdfAttachment
}

export type ChatDeltaSource = "text" | "transcript"

export type AssistantChatController = {
  appendDelta: (responseId: string, delta: string, source: ChatDeltaSource) => void
  finalize: (responseId: string, text?: string, source?: ChatDeltaSource) => void
}

export const responseIdFrom = (event: Record<string, unknown>) => {
  if (typeof event.response_id === "string" && event.response_id) {
    return event.response_id
  }
  const response = event.response as { id?: string } | undefined
  return response?.id ?? ""
}

const nestedTranscript = (event: Record<string, unknown>) => {
  if (typeof event.transcript === "string" && event.transcript.trim()) {
    return event.transcript.trim()
  }
  const item = event.item as { content?: Array<{ transcript?: string; text?: string }> } | undefined
  const fromItem = item?.content?.find((part) => part.transcript?.trim() || part.text?.trim())
  return fromItem?.transcript?.trim() || fromItem?.text?.trim() || ""
}

const assistantTextFrom = (event: Record<string, unknown>) => {
  if (typeof event.text === "string" && event.text.trim()) {
    return event.text.trim()
  }
  return nestedTranscript(event)
}

const textPartsFromItem = (item: unknown): string => {
  if (!item || typeof item !== "object") {
    return ""
  }
  const content = (item as { content?: unknown[] }).content
  if (!Array.isArray(content)) {
    return ""
  }

  const textChunks: string[] = []
  const transcriptChunks: string[] = []
  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue
    }
    const typed = part as { type?: string; transcript?: string; text?: string }
    if ((typed.type === "output_text" || typed.type === "text") && typed.text?.trim()) {
      textChunks.push(typed.text.trim())
    }
    if (typed.type === "output_audio" && typed.transcript?.trim()) {
      transcriptChunks.push(typed.transcript.trim())
    }
  }

  if (textChunks.length > 0) {
    return textChunks.join("\n\n").trim()
  }
  return transcriptChunks.join("\n\n").trim()
}

export const textFromResponse = (response: Record<string, unknown> | undefined): string => {
  const output = response?.output
  if (!Array.isArray(output)) {
    return ""
  }

  const textChunks: string[] = []
  const transcriptChunks: string[] = []
  for (const item of output) {
    const chunk = textPartsFromItem(item)
    if (!chunk) {
      continue
    }
    const itemType = (item as { type?: string }).type
    const content = (item as { content?: Array<{ type?: string }> }).content
    const hasTextPart = Array.isArray(content) &&
      content.some((part) => part?.type === "output_text" || part?.type === "text")
    if (hasTextPart || itemType === "message") {
      textChunks.push(chunk)
    } else {
      transcriptChunks.push(chunk)
    }
  }

  if (textChunks.length > 0) {
    return textChunks.join("\n\n").trim()
  }
  return transcriptChunks.join("\n\n").trim()
}

const isAudioTranscriptDelta = (type: string) =>
  type.includes("output_audio_transcript.delta") || type.includes("audio_transcript.delta")

const isTextDelta = (type: string) =>
  (type.includes("output_text.delta") || type === "response.text.delta") && !type.includes("transcription")

const isAudioTranscriptDone = (type: string) =>
  type.includes("output_audio_transcript.done") || type === "response.audio_transcript.done"

const isTextDone = (type: string) =>
  type.includes("output_text.done") || type === "response.text.done"

export const handleAssistantChatEvent = (
  event: Record<string, unknown>,
  chat: AssistantChatController | null,
) => {
  if (!chat) {
    return
  }

  const type = typeof event.type === "string" ? event.type : ""
  const delta = typeof event.delta === "string" ? event.delta : ""
  const responseId = responseIdFrom(event)

  if (isTextDelta(type) && delta && responseId) {
    chat.appendDelta(responseId, delta, "text")
    return
  }

  if (isAudioTranscriptDelta(type) && delta && responseId) {
    chat.appendDelta(responseId, delta, "transcript")
    return
  }

  if (isTextDone(type) && responseId) {
    const text = assistantTextFrom(event)
    chat.finalize(responseId, text || undefined, "text")
    return
  }

  if (isAudioTranscriptDone(type) && responseId) {
    const text = assistantTextFrom(event)
    chat.finalize(responseId, text || undefined, "transcript")
    return
  }

  if (type === "response.output_item.done" && responseId) {
    const text = textPartsFromItem(event.item)
    if (text) {
      const item = event.item as { content?: Array<{ type?: string }> } | undefined
      const hasTextPart = Array.isArray(item?.content) &&
        item.content.some((part) => part?.type === "output_text" || part?.type === "text")
      chat.finalize(responseId, text, hasTextPart ? "text" : "transcript")
    }
    return
  }

  if (type === "response.done" && responseId) {
    const response = event.response as Record<string, unknown> | undefined
    const text = textFromResponse(response)
    chat.finalize(responseId, text || undefined, text ? "text" : "transcript")
  }
}
