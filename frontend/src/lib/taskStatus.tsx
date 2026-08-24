import { Archive, Check, Circle, X } from "lucide-react"
import type { TaskStatus } from "@/lib/tasks"
import { cn } from "@/lib/utils"

export const TASK_STATUS_VISUAL: Record<
  TaskStatus,
  {
    icon: typeof Check
    mark: string
    title: string
    description: string
    label: string
  }
> = {
  pending: {
    icon: Circle,
    mark: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    title: "text-foreground",
    description: "text-muted-foreground",
    label: "text-sky-700 dark:text-sky-400",
  },
  completed: {
    icon: Check,
    mark: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    title: "text-emerald-700 line-through dark:text-emerald-400",
    description: "text-emerald-700/70 line-through dark:text-emerald-400/80",
    label: "text-emerald-700 dark:text-emerald-400",
  },
  cancelled: {
    icon: X,
    mark: "bg-red-500/15 text-red-600 dark:text-red-400",
    title: "text-red-700 line-through dark:text-red-400",
    description: "text-red-700/70 line-through dark:text-red-400/80",
    label: "text-red-700 dark:text-red-400",
  },
  archived: {
    icon: Archive,
    mark: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400",
    title: "text-zinc-500 line-through dark:text-zinc-400",
    description: "text-zinc-500/70 line-through dark:text-zinc-400/80",
    label: "text-zinc-600 dark:text-zinc-400",
  },
}

export const TaskStatusMark = ({ status, className }: { status: TaskStatus; className?: string }) => {
  const visual = TASK_STATUS_VISUAL[status]
  const Icon = visual.icon
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full",
        visual.mark,
        className,
      )}
    >
      <Icon className="size-3.5 stroke-[2.5]" />
    </span>
  )
}
