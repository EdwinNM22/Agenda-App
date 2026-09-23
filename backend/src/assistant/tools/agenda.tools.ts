import type { RealtimeTool } from "../types.js"

export const AGENDA_TOOLS: RealtimeTool[] = [
  {
    type: "function",
    name: "create_task",
    description:
      "Crea una tarea. Úsala solo cuando el usuario ya dio de qué trata, la fecha y la hora. Si falta fecha o hora, no la llames: pregunta primero.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Título corto de la tarea, en el idioma del usuario.",
        },
        description: {
          type: "string",
          description: "Solo qué hay que hacer. Prohibido incluir fecha, hora, AM, PM o 'a las'.",
        },
        due_at: {
          type: "string",
          description:
            "Fecha y hora completas en 12 horas: YYYY-MM-DD hh:mm AM/PM (ejemplo 2026-08-22 03:00 PM). Obligatoria. No la inventes.",
        },
        notify_at: {
          type: "string",
          description:
            "Hora del aviso en 12 horas: YYYY-MM-DD hh:mm AM/PM. Si el usuario no pide otra, omítela. Si no quiere aviso, envía vacío.",
        },
      },
      required: ["title", "description", "due_at"],
    },
  },
  {
    type: "function",
    name: "list_tasks",
    description:
      "Consulta la agenda personal del usuario. Devuelve id, título, descripción, dueAt, notifyAt, status, statusLabel y group (overdue|today|tomorrow|upcoming|none). «Qué tengo hoy» o preguntas del día → date=hoy/today. Sin date solo si piden toda la agenda o histórico explícito. No sirve para Atlas.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "Filtro opcional por un día: YYYY-MM-DD o expresión relativa (hoy/today, ayer/yesterday, mañana/tomorrow). Omítelo para listar todas las tareas.",
        },
      },
    },
  },
  {
    type: "function",
    name: "update_task",
    description:
      "Modifica una tarea existente. Necesita el id de list_tasks. Pasa solo title, description, due_at, notify_at o status si el usuario los quiere cambiar. status: pending, completed, cancelled o archived.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "Id de la tarea, el que devolvió list_tasks.",
        },
        title: {
          type: "string",
          description: "Nuevo título. Omítelo si no cambia.",
        },
        description: {
          type: "string",
          description: "Nueva descripción. Solo qué hay que hacer. Prohibido incluir fecha u hora.",
        },
        due_at: {
          type: "string",
          description: "Nueva fecha y hora en 12 horas: YYYY-MM-DD hh:mm AM/PM. Omítela si no cambia.",
        },
        notify_at: {
          type: "string",
          description:
            "Nueva hora de aviso en 12 horas: YYYY-MM-DD hh:mm AM/PM. Omítela si no cambia. Vacío para quitar el aviso.",
        },
        status: {
          type: "string",
          enum: ["pending", "completed", "cancelled", "archived"],
          description:
            "Nuevo estado: pending, completed, cancelled o archived. Úsalo para completar, cancelar, archivar o reabrir.",
        },
      },
      required: ["task_id"],
    },
  },
  {
    type: "function",
    name: "delete_task",
    description:
      "Elimina una tarea existente. Necesita el id de list_tasks. Úsala cuando el usuario quiera borrar, cancelar o quitar una tarea que ya está en la agenda.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "Id de la tarea, el que devolvió list_tasks.",
        },
      },
      required: ["task_id"],
    },
  },
]
