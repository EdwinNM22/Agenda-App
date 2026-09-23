/** Mensajes assistant ya mostrados al usuario (no repetir typewriter al reabrir el chat). */
const revealed = new Set<string>()

export const isAssistantMessageRevealed = (messageId: string) => revealed.has(messageId)

export const markAssistantMessageRevealed = (messageId: string) => {
  if (messageId) {
    revealed.add(messageId)
  }
}

export const clearAssistantMessagesRevealed = () => {
  revealed.clear()
}
