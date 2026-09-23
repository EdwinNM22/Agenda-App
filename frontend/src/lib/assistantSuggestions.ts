import { CalendarDays, Landmark, Plus, Wallet, type LucideIcon } from "lucide-react"

export type AssistantSuggestion = {
  id: string
  label: string
  prompt: string
  Icon: LucideIcon
}

export type ComposerTagSuggestion = AssistantSuggestion & {
  chipLabel: string
}

const CORE_SUGGESTIONS: AssistantSuggestion[] = [
  {
    id: "today",
    label: "Qué tengo hoy",
    prompt: "¿Qué tengo hoy?",
    Icon: CalendarDays,
  },
  {
    id: "create",
    label: "Crear una tarea",
    prompt: "Quiero crear una tarea",
    Icon: Plus,
  },
  {
    id: "atlas",
    label: "Qué hay en Atlas",
    prompt: "¿Qué hay en Atlas?",
    Icon: Landmark,
  },
  {
    id: "bank",
    label: "Qué hay en el banco",
    prompt: "¿Qué hay en el banco?",
    Icon: Wallet,
  },
]

/** Cuadrícula inferior del Home. */
export const ASSISTANT_SUGGESTIONS: AssistantSuggestion[] = CORE_SUGGESTIONS

/** Etiquetas dentro del composer (mismas sugerencias). */
export const COMPOSER_TAG_SUGGESTIONS: ComposerTagSuggestion[] = CORE_SUGGESTIONS.map(
  (suggestion) => ({
    ...suggestion,
    chipLabel: suggestion.label,
  }),
)
