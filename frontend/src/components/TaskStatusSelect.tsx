import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { TaskStatusMark, TASK_STATUS_VISUAL } from "@/lib/taskStatus"
import { TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/lib/tasks"
import { cn } from "@/lib/utils"

type TaskStatusSelectProps = {
  value: TaskStatus
  onChange: (status: TaskStatus) => void
  disabled?: boolean
}

export const TaskStatusSelect = ({ value, onChange, disabled }: TaskStatusSelectProps) => {
  const current = value ?? "pending"
  const visual = TASK_STATUS_VISUAL[current]

  return (
    <Select value={current} onValueChange={(next) => onChange(next as TaskStatus)} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className={cn("h-8 min-w-36 gap-1.5 rounded-full border-transparent px-2", visual.mark)}
        aria-label="Estado de la tarea"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <TaskStatusMark status={current} className="size-4 bg-transparent" />
        <span className={cn("text-xs font-medium", visual.label)}>
          {TASK_STATUS_LABELS[current]}
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="end" className="z-[100] min-w-44">
        {TASK_STATUSES.map((status) => {
          const option = TASK_STATUS_VISUAL[status]
          return (
            <SelectItem key={status} value={status} className="gap-2">
              <span className="flex items-center gap-2">
                <TaskStatusMark status={status} />
                <span className={cn("font-medium", option.label)}>
                  {TASK_STATUS_LABELS[status]}
                </span>
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
