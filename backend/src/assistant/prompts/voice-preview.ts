/** Instrucciones para la preescucha de voz en el selector (TTS, no Realtime). */
export const VOICE_PREVIEW_INSTRUCTIONS =
  "Habla en español, cercano, natural y breve. Suena como un saludo de asistente."

export const buildVoicePreviewInput = (firstName: string): string =>
  `Hola ${firstName}, ¿en qué te puedo ayudar hoy?`
