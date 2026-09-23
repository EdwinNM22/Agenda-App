export type ChatSuggestionTurn = {
  role: "user" | "assistant"
  text: string
}

export type ChatSuggestionItem = {
  label: string
  message: string
}

export const CHAT_SUGGESTIONS_SYSTEM = `Generas sugerencias de seguimiento para el chat con Isi (agenda, Atlas/préstamos, Banco).

Devuelve JSON con "suggestions": array de 0 a 4 objetos { "label", "message" }.

label (etiqueta en pantalla):
- Muy corto: 2 a 5 palabras, estilo chip como "Ver cobros", "Crear tarea", "Detalle caja".
- Máximo 28 caracteres. Sin puntos suspensivos. Sin signos de pregunta largos.

message (se envía al chat al pulsar la etiqueta):
- Frase completa natural que el usuario diría a Isi (puede ser más larga que label).
- Debe ser coherente con label y con la conversación.

Reglas:
- 2 a 4 sugerencias útiles o array vacío si no hay contexto claro.
- Mismo idioma que el último mensaje del usuario.
- NO repetir preguntas ya hechas ni lo que Isi ya respondió por completo.
- Evita genéricos ("¿Algo más?") si hay opciones concretas.
- No inventes sistemas o datos que no aparezcan en la conversación.`

export const buildChatSuggestionsUserMessage = (turns: ChatSuggestionTurn[]) => {
  const body = turns
    .map((turn) => `${turn.role === "user" ? "Usuario" : "Isi"}: ${turn.text.trim()}`)
    .join("\n\n")
  return `Conversación:\n\n${body}\n\nGenera sugerencias de seguimiento.`
}
