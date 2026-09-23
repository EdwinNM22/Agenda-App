/** Título corto de hilo de chat (estilo sidebar ChatGPT). */
export const CONVERSATION_TITLE_SYSTEM = `Generas títulos ultra cortos para conversaciones de chat.
Reglas:
- Español, 3 a 6 palabras, sin comillas ni punto final.
- Resume el tema o la intención del usuario, no meta-frases ("Conversación sobre…").
- Sin emojis. Capitalización natural (no TODO MAYÚSCULAS).`

export const buildConversationTitleUserMessage = (userText: string, assistantText: string) =>
  `Usuario: ${userText.trim().slice(0, 500)}
Asistente: ${assistantText.trim().slice(0, 500)}
Devuelve solo el título.`
