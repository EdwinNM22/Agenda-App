import { api } from "@/lib/api"
import { assetUrl } from "@/lib/apiBase"

export const TASK_STATUSES = ["pending", "completed", "cancelled", "archived"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export type TaskAttachment = {
  id: number
  taskId: number
  name: string
  url: string
  thumbUrl: string | null
  mimeType: string
  size: number
}

export type Task = {
  id: number
  title: string
  description: string
  dueAt: string | null
  notifyAt: string | null
  status: TaskStatus
  attachments: TaskAttachment[]
}

export const isImageAttachment = (attachment: TaskAttachment) =>
  attachment.mimeType.startsWith("image/")

export const hydrateTask = (task: Task): Task => ({
  ...task,
  notifyAt: task.notifyAt ?? null,
  attachments: (task.attachments ?? []).map((item) => ({
    ...item,
    url: assetUrl(item.url),
    thumbUrl: item.thumbUrl ? assetUrl(item.thumbUrl) : null,
  })),
})

export const attachmentThumbUrl = (attachment: TaskAttachment) =>
  assetUrl(attachment.thumbUrl || attachment.url)

export const taskImages = (task: Task) => (task.attachments ?? []).filter(isImageAttachment)

export const taskFiles = (task: Task) =>
  (task.attachments ?? []).filter((item) => !isImageAttachment(item))

export const isPdfAttachment = (attachment: TaskAttachment) =>
  attachment.mimeType === "application/pdf" || attachment.name.toLowerCase().endsWith(".pdf")

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  completed: "Completada",
  cancelled: "Cancelada",
  archived: "Archivada",
}

const STATUS_ALIASES: Record<string, TaskStatus> = {
  pending: "pending",
  pendiente: "pending",
  completed: "completed",
  completado: "completed",
  completada: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  cancelado: "cancelled",
  cancelada: "cancelled",
  archived: "archived",
  archivado: "archived",
  archivada: "archived",
}

export const parseTaskStatus = (value: unknown): TaskStatus | null => {
  if (typeof value !== "string") {
    return null
  }
  return STATUS_ALIASES[value.trim().toLowerCase()] ?? null
}

const TWELVE_HOUR =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i
const TWENTY_FOUR_HOUR =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/

const pad = (value: number) => String(value).padStart(2, "0")

const formatTwelveHour = (hour24: number, minute: string): string => {
  const period = hour24 >= 12 ? "PM" : "AM"
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${pad(hour12)}:${minute} ${period}`
}

export const toNaiveDateTime = (value?: string | null): string | null => {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  const twelve = trimmed.match(TWELVE_HOUR)
  if (twelve) {
    const [, date, hourRaw, minute, period] = twelve
    const hour = Number(hourRaw)
    if (hour < 1 || hour > 12) {
      return null
    }
    return `${date} ${pad(hour)}:${minute} ${period.toUpperCase()}`
  }
  const twentyFour = trimmed.match(TWENTY_FOUR_HOUR)
  if (!twentyFour) {
    return null
  }
  const [, date, hourRaw, minute] = twentyFour
  const hour = Number(hourRaw)
  if (hour > 23) {
    return null
  }
  return `${date} ${formatTwelveHour(hour, minute)}`
}

export const listTasks = async (date?: string) => {
  const path = date ? `/tasks?date=${encodeURIComponent(date)}` : "/tasks"
  const data = await api<{ tasks: Task[] }>(path)
  return { tasks: data.tasks.map(hydrateTask) }
}

export const createTask = async (
  title: string,
  description: string,
  dueAt: string | null,
  status: TaskStatus = "pending",
  notifyAt?: string | null,
) => {
  const data = await api<{ task: Task }>("/tasks", {
    method: "POST",
    body: JSON.stringify({
      title,
      description,
      dueAt: toNaiveDateTime(dueAt),
      notifyAt: toNaiveDateTime(notifyAt === undefined ? dueAt : notifyAt),
      status,
    }),
  })
  return { task: hydrateTask(data.task) }
}

export type TaskPatch = {
  title?: string
  description?: string
  dueAt?: string | null
  notifyAt?: string | null
  status?: TaskStatus
}

export const updateTask = async (id: number, patch: TaskPatch) => {
  const data = await api<{ task: Task }>(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...patch,
      dueAt: patch.dueAt !== undefined ? toNaiveDateTime(patch.dueAt) : undefined,
      notifyAt: patch.notifyAt !== undefined ? toNaiveDateTime(patch.notifyAt) : undefined,
    }),
  })
  return { task: hydrateTask(data.task) }
}

export const deleteTask = (id: number) =>
  api<{ ok: true }>(`/tasks/${id}`, { method: "DELETE" })

export const uploadTaskAttachment = async (taskId: number, file: File) => {
  const form = new FormData()
  form.append("file", file)
  const data = await api<{ attachment: TaskAttachment; task: Task }>(
    `/tasks/${taskId}/attachments`,
    {
      method: "POST",
      body: form,
    },
  )
  const task = hydrateTask(data.task)
  const attachment =
    task.attachments.find((item) => item.id === data.attachment.id) ?? data.attachment
  return { attachment, task }
}

export const deleteTaskAttachment = async (taskId: number, attachmentId: number) => {
  const data = await api<{ ok: true; task: Task }>(
    `/tasks/${taskId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    },
  )
  return { ok: true as const, task: hydrateTask(data.task) }
}

export const formatTaskDueAt = (dueAt: string | null): string => {
  if (!dueAt) {
    return "—"
  }
  return dueAt
}

export type TaskGroupId = "overdue" | "today" | "tomorrow" | "upcoming" | "none"

export const TASK_GROUPS: { id: TaskGroupId; title: string }[] = [
  { id: "overdue", title: "Vencidas" },
  { id: "today", title: "Hoy" },
  { id: "tomorrow", title: "Mañana" },
  { id: "upcoming", title: "Próximas" },
  { id: "none", title: "Sin fecha" },
]

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

const dueAtToDate = (dueAt: string | null): Date | null => {
  const local = toDatetimeLocalValue(dueAt)
  if (!local) {
    return null
  }
  const parsed = new Date(local)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const parseTaskDueAt = dueAtToDate

export const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const isSameLocalDay = (left: Date, right: Date) =>
  localDateKey(left) === localDateKey(right)

const compareByDue = (left: Task, right: Task) => {
  const leftTime = dueAtToDate(left.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY
  const rightTime = dueAtToDate(right.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY
  return leftTime - rightTime
}

export const datesWithTasks = (tasks: Task[]): Date[] => {
  const seen = new Set<string>()
  const dates: Date[] = []
  for (const task of tasks) {
    const due = dueAtToDate(task.dueAt)
    if (!due) {
      continue
    }
    const key = localDateKey(due)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    dates.push(new Date(due.getFullYear(), due.getMonth(), due.getDate()))
  }
  return dates
}

export const datesByTaskStatus = (tasks: Task[]): Record<TaskStatus, Date[]> => {
  const buckets: Record<TaskStatus, Map<string, Date>> = {
    pending: new Map(),
    completed: new Map(),
    cancelled: new Map(),
    archived: new Map(),
  }
  for (const task of tasks) {
    const due = dueAtToDate(task.dueAt)
    if (!due) {
      continue
    }
    const status = task.status ?? "pending"
    const key = localDateKey(due)
    if (!buckets[status].has(key)) {
      buckets[status].set(key, new Date(due.getFullYear(), due.getMonth(), due.getDate()))
    }
  }
  return {
    pending: [...buckets.pending.values()],
    completed: [...buckets.completed.values()],
    cancelled: [...buckets.cancelled.values()],
    archived: [...buckets.archived.values()],
  }
}

export const filterTasksByDay = (tasks: Task[], day: Date) =>
  tasks
    .filter((task) => {
      const due = dueAtToDate(task.dueAt)
      return due ? isSameLocalDay(due, day) : false
    })
    .sort(compareByDue)

const endOfWeekSunday = (now: Date) => {
  const weekday = now.getDay()
  const daysUntilSunday = weekday === 0 ? 0 : 7 - weekday
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday)
}

export type HomeSectionId = "today" | "tomorrow" | "week"

export const HOME_SECTIONS: { id: HomeSectionId; title: string }[] = [
  { id: "today", title: "Hoy" },
  { id: "tomorrow", title: "Mañana" },
  { id: "week", title: "Esta semana" },
]

export const getHomeSection = (dueAt: string | null, now = new Date()): HomeSectionId | null => {
  const due = dueAtToDate(dueAt)
  if (!due) {
    return null
  }
  const diffDays = Math.round((startOfLocalDay(due) - startOfLocalDay(now)) / 86_400_000)
  if (diffDays === 0) {
    return "today"
  }
  if (diffDays === 1) {
    return "tomorrow"
  }
  if (diffDays >= 2 && startOfLocalDay(due) <= startOfLocalDay(endOfWeekSunday(now))) {
    return "week"
  }
  return null
}

export const groupHomeTasks = (tasks: Task[], now = new Date()) => {
  const buckets: Record<HomeSectionId, Task[]> = {
    today: [],
    tomorrow: [],
    week: [],
  }
  for (const task of tasks) {
    const section = getHomeSection(task.dueAt, now)
    if (section) {
      buckets[section].push(task)
    }
  }
  for (const section of HOME_SECTIONS) {
    buckets[section.id].sort((left, right) => {
      const leftDone = (left.status ?? "pending") === "completed" ? 1 : 0
      const rightDone = (right.status ?? "pending") === "completed" ? 1 : 0
      if (leftDone !== rightDone) {
        return leftDone - rightDone
      }
      return compareByDue(left, right)
    })
  }
  return HOME_SECTIONS.map((section) => ({ ...section, tasks: buckets[section.id] }))
}

export const formatLongDate = (date: Date) =>
  new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date)

export const getTaskGroup = (dueAt: string | null, now = new Date()): TaskGroupId => {
  const due = dueAtToDate(dueAt)
  if (!due) {
    return "none"
  }
  const diffDays = Math.round((startOfLocalDay(due) - startOfLocalDay(now)) / 86_400_000)
  if (diffDays < 0) {
    return "overdue"
  }
  if (diffDays === 0) {
    return "today"
  }
  if (diffDays === 1) {
    return "tomorrow"
  }
  return "upcoming"
}

export const formatTaskWhen = (dueAt: string | null, now = new Date()): string => {
  const due = dueAtToDate(dueAt)
  if (!due) {
    return "Sin fecha"
  }
  const time = new Intl.DateTimeFormat("es", {
    hour: "numeric",
    minute: "2-digit",
  }).format(due)
  const group = getTaskGroup(dueAt, now)
  if (group === "today") {
    return time
  }
  if (group === "tomorrow") {
    return `Mañana · ${time}`
  }
  const date = new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
  }).format(due)
  return `${date} · ${time}`
}

export const toDatetimeLocalValue = (dueAt: string | null): string => {
  const naive = toNaiveDateTime(dueAt)
  if (!naive) {
    return ""
  }
  const twelve = naive.match(TWELVE_HOUR)
  if (!twelve) {
    return ""
  }
  const [, date, hourRaw, minute, period] = twelve
  let hour = Number(hourRaw)
  if (period.toUpperCase() === "AM") {
    hour = hour === 12 ? 0 : hour
  } else {
    hour = hour === 12 ? 12 : hour + 12
  }
  return `${date}T${pad(hour)}:${minute}`
}
