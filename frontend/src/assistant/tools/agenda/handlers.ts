import {
  createTask,
  deleteTask,
  getTaskGroup,
  listTasks,
  parseTaskStatus,
  TASK_STATUS_LABELS,
  toNaiveDateTime,
  updateTask,
} from "@/lib/tasks"
import { notifyTasksChanged } from "@/lib/taskEvents"
import { resolvePrestamoPeriodPhrase } from "@/assistant/shared/period"
import { finishTool } from "../runtime"
import type { ToolRunResult } from "../types"

type CreateTaskArgs = {
  title?: unknown
  description?: unknown
  due_at?: unknown
  dueAt?: unknown
  notify_at?: unknown
  notifyAt?: unknown
}

const parseDueAt = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }
  return toNaiveDateTime(value)
}

const parseTaskArgs = (
  raw: string,
): { title: string; description: string; dueAt: string | null; notifyAt?: string | null } | null => {
  try {
    const parsed = JSON.parse(raw) as CreateTaskArgs
    const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
    const description = typeof parsed.description === "string" ? parsed.description.trim() : ""
    if (!title) {
      return null
    }
    const notifyRaw = parsed.notify_at ?? parsed.notifyAt
    return {
      title,
      description,
      dueAt: parseDueAt(parsed.due_at ?? parsed.dueAt),
      notifyAt: notifyRaw === undefined ? undefined : parseDueAt(typeof notifyRaw === "string" ? notifyRaw : null),
    }
  } catch {
    return null
  }
}

export const runCreateTask = async (
  channel: RTCDataChannel,
  callId: string,
  rawArgs: string,
): Promise<ToolRunResult> => {
  const args = parseTaskArgs(rawArgs)
  if (!args) {
    return finishTool(channel, callId, {
      ok: false,
      message: "Faltó el título de la tarea",
    })
  }

  try {
    const { task } = await createTask(args.title, args.description, args.dueAt, "pending", args.notifyAt)
    notifyTasksChanged()
    return finishTool(channel, callId, {
      ok: true,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
      notifyAt: task.notifyAt,
    })
  } catch (error) {
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo crear la tarea",
    })
  }
}

const parseListDate = (raw: string): string | undefined => {
  try {
    const parsed = JSON.parse(raw) as { date?: unknown }
    if (typeof parsed.date !== "string") {
      return undefined
    }
    const trimmed = parsed.date.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
    const resolved = resolvePrestamoPeriodPhrase(trimmed)
    if (resolved?.fecha) {
      return resolved.fecha
    }
  } catch {
    // sin fecha: listar todas
  }
  return undefined
}

export const runListTasks = async (
  channel: RTCDataChannel,
  callId: string,
  rawArgs: string,
): Promise<ToolRunResult> => {
  const date = parseListDate(rawArgs)
  try {
    const { tasks } = await listTasks(date)
    return finishTool(channel, callId, {
      ok: true,
      tasks: tasks.slice(0, 30).map((task) => {
        const status = task.status ?? "pending"
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          dueAt: task.dueAt,
          notifyAt: task.notifyAt,
          status,
          statusLabel: TASK_STATUS_LABELS[status],
          group: getTaskGroup(task.dueAt),
        }
      }),
    })
  } catch (error) {
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudieron leer las tareas",
    })
  }
}

const parseTaskId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === "string") {
    const id = Number(value.trim())
    if (Number.isInteger(id) && id > 0) {
      return id
    }
  }
  return null
}

const findTaskById = async (id: number) => {
  const { tasks } = await listTasks()
  return tasks.find((task) => task.id === id) ?? null
}

export const runUpdateTask = async (
  channel: RTCDataChannel,
  callId: string,
  rawArgs: string,
): Promise<ToolRunResult> => {
  let parsed: {
    task_id?: unknown
    id?: unknown
    title?: unknown
    description?: unknown
    due_at?: unknown
    dueAt?: unknown
    notify_at?: unknown
    notifyAt?: unknown
    status?: unknown
  }
  try {
    parsed = JSON.parse(rawArgs) as {
      task_id?: unknown
      id?: unknown
      title?: unknown
      description?: unknown
      due_at?: unknown
      dueAt?: unknown
      notify_at?: unknown
      notifyAt?: unknown
      status?: unknown
    }
  } catch {
    return finishTool(channel, callId, { ok: false, message: "No se pudieron leer los datos" })
  }

  const id = parseTaskId(parsed.task_id ?? parsed.id)
  if (!id) {
    return finishTool(channel, callId, {
      ok: false,
      message: "Faltó el id de la tarea. Llama list_tasks primero.",
    })
  }

  try {
    const existing = await findTaskById(id)
    if (!existing) {
      return finishTool(channel, callId, { ok: false, message: "Tarea no encontrada" })
    }

    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : existing.title
    const description =
      typeof parsed.description === "string" ? parsed.description.trim() : existing.description
    const dueRaw = parsed.due_at ?? parsed.dueAt
    const dueAt =
      typeof dueRaw === "string" && dueRaw.trim() ? parseDueAt(dueRaw) : existing.dueAt

    if (typeof dueRaw === "string" && dueRaw.trim() && !dueAt) {
      return finishTool(channel, callId, {
        ok: false,
        message: "La fecha y hora no son válidas",
      })
    }

    const status = parsed.status !== undefined ? parseTaskStatus(parsed.status) : existing.status
    if (parsed.status !== undefined && !status) {
      return finishTool(channel, callId, {
        ok: false,
        message: "El estado debe ser pendiente, completada, cancelada o archivada",
      })
    }

    const notifyRaw = parsed.notify_at ?? parsed.notifyAt
    let notifyAt = existing.notifyAt
    if (notifyRaw !== undefined) {
      notifyAt =
        typeof notifyRaw === "string" && notifyRaw.trim() ? parseDueAt(notifyRaw) : null
      if (typeof notifyRaw === "string" && notifyRaw.trim() && !notifyAt) {
        return finishTool(channel, callId, {
          ok: false,
          message: "La hora de aviso no es válida",
        })
      }
    }

    const { task } = await updateTask(id, {
      title,
      description,
      dueAt,
      notifyAt,
      status: status ?? existing.status,
    })
    notifyTasksChanged()
    return finishTool(channel, callId, {
      ok: true,
      id: task.id,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
      notifyAt: task.notifyAt,
      status: task.status,
    })
  } catch (error) {
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar la tarea",
    })
  }
}

export const runDeleteTask = async (
  channel: RTCDataChannel,
  callId: string,
  rawArgs: string,
): Promise<ToolRunResult> => {
  let parsed: { task_id?: unknown; id?: unknown }
  try {
    parsed = JSON.parse(rawArgs) as { task_id?: unknown; id?: unknown }
  } catch {
    return finishTool(channel, callId, { ok: false, message: "No se pudieron leer los datos" })
  }

  const id = parseTaskId(parsed.task_id ?? parsed.id)
  if (!id) {
    return finishTool(channel, callId, {
      ok: false,
      message: "Faltó el id de la tarea. Llama list_tasks primero.",
    })
  }

  try {
    const existing = await findTaskById(id)
    if (!existing) {
      return finishTool(channel, callId, { ok: false, message: "Tarea no encontrada" })
    }

    await deleteTask(id)
    notifyTasksChanged()
    return finishTool(channel, callId, {
      ok: true,
      id,
      title: existing.title,
    })
  } catch (error) {
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo eliminar la tarea",
    })
  }
}
