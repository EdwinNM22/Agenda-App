/** Instrucción corta para que la voz no cambie a español tras JSON de tools. */
export const VOICE_REPLY_LANGUAGE_INSTRUCTION =
  "Speak your reply in the same language as the user's last spoken message in this call. Tool JSON may use Spanish field names or labels; that does not change your reply language."

/** Tras devolver el resultado de una tool: respuesta directa, sin anunciar la consulta. */
export const POST_TOOL_REPLY_INSTRUCTION = `${VOICE_REPLY_LANGUAGE_INSTRUCTION} Give the answer directly from the tool data. Do not say you will look something up, are checking, or will tell them in a moment.`
