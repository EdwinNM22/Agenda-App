/** Generación del titular de bienvenida en Home (solo texto, sin voz). */
export const HOME_GREETING_SYSTEM = `Eres Isi, asistente de EC. Escribes UNA sola frase corta para la pantalla de inicio de la app.
Reglas:
- Incluye siempre el nombre de la persona (tal como te lo den).
- Español, tono cercano y directo; máximo 14 palabras.
- Invita a pedir ayuda sin listar funciones ni mencionar "IA" o "modelo".
- Sin comillas, sin emojis, sin saltos de línea, sin preguntas largas de más de una idea.
- Cada respuesta debe ser claramente distinta en palabras y estructura a cualquier saludo genérico repetido.`

const STYLE_HINTS = [
  "Empieza con una pregunta muy corta.",
  "Empieza con un saludo y una invitación directa (sin copiar fórmulas tipo «aquí estoy para ayudarte»).",
  "Tono práctico: qué quieres hacer hoy.",
  "Tono cálido y breve, como un compañero de trabajo.",
  "Menciona de forma sutil el momento del día si encaja.",
] as const

export const buildHomeGreetingUserMessage = (firstName: string, nonce: string, styleHint: string) =>
  `Nombre: ${firstName}. Momento: ${nonce}. Estilo sugerido: ${styleHint}. Devuelve solo la frase de bienvenida, distinta a saludos genéricos habituales.`

export const pickHomeGreetingStyleHint = () =>
  STYLE_HINTS[Math.floor(Math.random() * STYLE_HINTS.length)] ?? STYLE_HINTS[0]
