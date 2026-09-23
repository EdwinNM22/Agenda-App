import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  FileText,
  Landmark,
  ListTodo,
  Plus,
  Sparkles,
  Sun,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export type AssistantSuggestion = {
  id: string
  label: string
  prompt: string
  Icon: LucideIcon
}

export type ComposerTagSuggestion = AssistantSuggestion & {
  chipLabel: string
}

/** Cuadrícula inferior del Home (como antes). */
export const ASSISTANT_SUGGESTIONS: AssistantSuggestion[] = [
  { id: "today", label: "Qué tengo hoy", prompt: "¿Qué tareas tengo para hoy?", Icon: CalendarDays },
  { id: "create", label: "Crear una tarea", prompt: "Quiero crear una tarea", Icon: Plus },
  { id: "week", label: "Resumen de la semana", prompt: "Resúmeme las tareas de esta semana", Icon: ListTodo },
  { id: "bank", label: "Movimientos del banco", prompt: "Muéstrame los últimos movimientos del banco", Icon: Wallet },
  { id: "pending", label: "Pendientes", prompt: "¿Qué tareas tengo pendientes?", Icon: Clock },
  { id: "report", label: "Generar un reporte", prompt: "Genera un reporte de mis tareas", Icon: FileText },
]

/** Etiquetas extra dentro del composer (no duplican la cuadrícula). */
export const COMPOSER_TAG_SUGGESTIONS: ComposerTagSuggestion[] = [
  {
    id: "tomorrow",
    label: "Agenda de mañana",
    chipLabel: "Mañana",
    prompt: "¿Qué tengo agendado para mañana?",
    Icon: Sun,
  },
  {
    id: "done",
    label: "Tareas completadas",
    chipLabel: "Hechas",
    prompt: "¿Qué tareas completé recientemente?",
    Icon: CheckCircle2,
  },
  {
    id: "month",
    label: "Resumen del mes",
    chipLabel: "El mes",
    prompt: "Resumen de mis tareas de este mes",
    Icon: CalendarRange,
  },
  {
    id: "loan",
    label: "Estado del préstamo",
    chipLabel: "Préstamo",
    prompt: "Consulta el estado de mi préstamo",
    Icon: Landmark,
  },
  {
    id: "expense",
    label: "Registrar movimiento",
    chipLabel: "Gasto",
    prompt: "Quiero registrar un movimiento en el banco",
    Icon: Wallet,
  },
  {
    id: "help",
    label: "Qué puede hacer Isi",
    chipLabel: "Ayuda",
    prompt: "¿Qué cosas puedes hacer por mí?",
    Icon: Sparkles,
  },
]
