import { hydrateTask, type Task } from "@/lib/tasks"

export type TaskSocketEvent =
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task }
  | { type: "task.deleted"; id: number }
  | { type: "pong" }

const withAttachments = (task: Task): Task => hydrateTask(task)

export const applyTaskSocketEvent = (tasks: Task[], event: TaskSocketEvent): Task[] => {
  if (event.type === "task.created") {
    const incoming = withAttachments(event.task)
    if (tasks.some((task) => task.id === incoming.id)) {
      return tasks.map((task) => (task.id === incoming.id ? incoming : task))
    }
    return [incoming, ...tasks]
  }

  if (event.type === "task.updated") {
    const incoming = withAttachments(event.task)
    return tasks.map((task) => (task.id === incoming.id ? incoming : task))
  }

  if (event.type === "task.deleted") {
    return tasks.filter((task) => task.id !== event.id)
  }

  return tasks
}

const isTaskSocketEvent = (value: unknown): value is TaskSocketEvent => {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false
  }
  const event = value as TaskSocketEvent
  return (
    event.type === "pong" ||
    event.type === "task.created" ||
    event.type === "task.updated" ||
    event.type === "task.deleted"
  )
}

export const parseTaskSocketEvent = (raw: string): TaskSocketEvent | null => {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isTaskSocketEvent(parsed) ? parsed : null
  } catch {
    return null
  }
}
