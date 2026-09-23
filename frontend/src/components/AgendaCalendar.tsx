import { useMemo, useState } from "react"
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { es } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { TaskItem } from "@/components/TaskItem"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TASK_STATUS_VISUAL } from "@/lib/taskStatus"
import {
  filterTasksByDay,
  formatLongDate,
  formatTaskTime,
  indexTasksByDay,
  localDateKey,
  type Task,
  type TaskStatus,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"

const WEEK_STARTS_ON = 1
const MAX_CHIPS = 2

const WEEKDAY_SHORT: Record<string, string> = {
  lunes: "lun",
  martes: "mar",
  miércoles: "mier",
  miercoles: "mier",
  jueves: "jue",
  viernes: "vie",
  sábado: "sáb",
  sabado: "sáb",
  domingo: "dom",
}

const formatWeekdayShort = (date: Date) => {
  const name = format(date, "EEEE", { locale: es }).toLowerCase()
  return WEEKDAY_SHORT[name] ?? name.slice(0, 3)
}

const formatMonthShort = (date: Date) => {
  const raw = format(date, "MMM", { locale: es }).replace(/\./g, "").toLowerCase()
  if (raw === "sept") {
    return "sep"
  }
  return raw
}

const formatDayMonthCell = (date: Date) => ({
  day: format(date, "d"),
  month: formatMonthShort(date),
})

const WEEKDAY_HEADER_LABELS = Array.from({ length: 7 }, (_, index) =>
  formatWeekdayShort(addDays(startOfWeek(new Date(), { weekStartsOn: WEEK_STARTS_ON }), index)),
)

const STATUS_CHIP: Record<TaskStatus, { shell: string; title: string }> = {
  pending: {
    shell: "border-l-sky-500 bg-sky-500/18 text-sky-950 dark:text-sky-50",
    title: "",
  },
  completed: {
    shell: "border-l-emerald-500 bg-emerald-500/16 text-emerald-950 dark:text-emerald-50",
    title: "line-through opacity-80",
  },
  cancelled: {
    shell: "border-l-red-500 bg-red-500/16 text-red-950 dark:text-red-50",
    title: "line-through opacity-75",
  },
  archived: {
    shell: "border-l-zinc-400 bg-zinc-500/14 text-zinc-700 dark:text-zinc-200",
    title: "line-through opacity-70",
  },
}

const CalendarDayTaskChip = ({
  task,
  compact = false,
  stacked = false,
}: {
  task: Task
  compact?: boolean
  stacked?: boolean
}) => {
  const status = task.status ?? "pending"
  const chip = STATUS_CHIP[status]
  const time = formatTaskTime(task.dueAt)
  const label = task.title.trim() || "Sin título"
  const hint = time ? `${label} · ${time}` : label

  if (compact) {
    return (
      <span
        className={cn(
          "block min-w-0 rounded-r-sm border-l-2 px-0.5 py-px opacity-95",
          chip.shell,
        )}
        title={hint}
      >
        <span className={cn("truncate text-[8px] leading-tight font-medium", chip.title)}>
          {time ? `${time} · ${label}` : label}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn("block min-w-0 rounded-r-sm border-l-[3px] px-1 py-0.5", chip.shell)}
      title={hint}
    >
      <span
        className={cn(
          "text-[10px] leading-snug font-semibold",
          stacked ? "line-clamp-1" : "line-clamp-2",
          chip.title,
        )}
      >
        {label}
      </span>
      {time ? (
        <span className="mt-0.5 block truncate text-[9px] font-medium tabular-nums opacity-75">
          {time}
        </span>
      ) : null}
    </span>
  )
}

type AgendaCalendarProps = {
  tasks: Task[]
  taskDetailOpen?: boolean
  onOpenTask: (task: Task) => void
}

export const AgendaCalendar = ({
  tasks,
  taskDetailOpen = false,
  onOpenTask,
}: AgendaCalendarProps) => {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const datedTasks = useMemo(
    () => tasks.filter((task) => task.dueAt),
    [tasks],
  )
  const tasksByDay = useMemo(() => indexTasksByDay(datedTasks), [datedTasks])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth)
    const monthEnd = endOfMonth(visibleMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [visibleMonth])

  const weeks = useMemo(() => {
    const rows: Date[][] = []
    for (let index = 0; index < calendarDays.length; index += 7) {
      rows.push(calendarDays.slice(index, index + 7))
    }
    return rows
  }, [calendarDays])

  const selectedTasks = useMemo(
    () => (selectedDay ? filterTasksByDay(tasks, selectedDay) : []),
    [selectedDay, tasks],
  )

  const monthLabel = format(visibleMonth, "MMMM yyyy", { locale: es })

  const goToday = () => {
    setVisibleMonth(startOfMonth(new Date()))
    setSelectedDay(null)
  }

  const onDayPress = (day: Date) => {
    if (!isSameMonth(day, visibleMonth)) {
      setVisibleMonth(startOfMonth(day))
    }
    setSelectedDay(day)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold capitalize">{monthLabel}</p>
          <p className="text-xs text-muted-foreground">
            Toca un día para ver sus tareas
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="glass-surface rounded-full"
            onClick={goToday}
          >
            Hoy
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            onClick={() => setVisibleMonth((month) => subMonths(month, 1))}
            aria-label="Mes anterior"
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
            aria-label="Mes siguiente"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAY_HEADER_LABELS.map((label) => (
            <div
              key={label}
              className="py-2 text-center text-[10px] font-semibold tracking-tight text-muted-foreground lowercase"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="flex flex-col">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((day) => {
                const key = localDateKey(day)
                const dayTasks = tasksByDay.get(key) ?? []
                const outside = !isSameMonth(day, visibleMonth)
                const today = isToday(day)
                const selected = selectedDay ? isSameDay(day, selectedDay) : false
                const pendingCount = dayTasks.filter(
                  (task) => (task.status ?? "pending") === "pending",
                ).length
                const chips = dayTasks.slice(0, MAX_CHIPS)
                const extra = dayTasks.length - chips.length
                const { day: dayNumber, month: monthShort } = formatDayMonthCell(day)

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onDayPress(day)}
                    className={cn(
                      "relative flex h-[6rem] flex-col gap-0.5 overflow-hidden border-r p-1 text-left transition-colors last:border-r-0",
                      outside && "bg-muted/20",
                      selected && "z-[1] bg-primary/8 ring-2 ring-inset ring-primary/50",
                      !selected && "hover:bg-muted/35 active:bg-muted/50",
                    )}
                    aria-label={
                      dayTasks.length > 0
                        ? `${format(day, "d MMMM", { locale: es })}, ${dayTasks.length} tareas`
                        : format(day, "d MMMM", { locale: es })
                    }
                    aria-pressed={selected}
                  >
                    <span className="flex items-start justify-between gap-0.5 px-0.5">
                      <span
                        className={cn(
                          "inline-flex min-w-0 items-baseline gap-0.5 rounded-full px-1 py-0.5 text-left leading-none",
                          today && "bg-primary px-1.5 text-primary-foreground",
                          !today && outside && "text-muted-foreground",
                          !today && !outside && "text-foreground",
                        )}
                      >
                        <span className="text-sm font-semibold tabular-nums">{dayNumber}</span>
                        <span
                          className={cn(
                            "truncate text-[10px] font-medium lowercase",
                            today ? "text-primary-foreground/85" : "text-muted-foreground",
                          )}
                        >
                          {monthShort}
                        </span>
                      </span>
                      {pendingCount > 0 ? (
                        <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                          {pendingCount}
                        </span>
                      ) : dayTasks.length > 0 ? (
                        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                      ) : null}
                    </span>

                    <span className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                      {chips.map((task, index) => (
                        <CalendarDayTaskChip
                          key={task.id}
                          task={task}
                          compact={index > 0}
                          stacked={chips.length > 1}
                        />
                      ))}
                      {extra > 0 ? (
                        <span className="shrink-0 truncate px-0.5 text-[8px] font-medium text-muted-foreground">
                          +{extra} más
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-1 text-[11px] text-muted-foreground">
        {(["pending", "completed", "cancelled"] as const).map((status) => {
          const visual = TASK_STATUS_VISUAL[status]
          const Icon = visual.icon
          return (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span className={cn("flex size-4 items-center justify-center rounded-full", visual.mark)}>
                <Icon className="size-2.5 stroke-[2.5]" />
              </span>
              {status === "pending" ? "Pendiente" : status === "completed" ? "Hecha" : "Cancelada"}
            </span>
          )
        })}
      </div>

      <Dialog
        open={selectedDay !== null}
        modal={!taskDetailOpen}
        onOpenChange={(open) => {
          if (!open && !taskDetailOpen) {
            setSelectedDay(null)
          }
        }}
      >
        <DialogContent
          showCloseButton
          overlayClassName={cn("z-[52]", taskDetailOpen && "pointer-events-none bg-black/5 backdrop-blur-none")}
          className={cn(
            "top-[50%] left-[50%] z-[53] flex w-[min(100%-max(1rem,var(--k-safe-area-left))-max(1rem,var(--k-safe-area-right)),32rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-2xl p-0 max-sm:top-auto max-sm:bottom-[calc(var(--agenda-tabbar-offset)+0.75rem)] max-sm:max-h-[min(72dvh,calc(100dvh-var(--k-safe-area-top)-var(--agenda-tabbar-offset)-1.25rem))] max-sm:-translate-y-0 max-sm:rounded-t-3xl sm:max-h-[min(80dvh,calc(100dvh-var(--k-safe-area-top)-var(--k-safe-area-bottom)-2rem))]",
            taskDetailOpen && "pointer-events-none opacity-95",
          )}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            if (taskDetailOpen) {
              event.preventDefault()
            }
          }}
          onInteractOutside={(event) => {
            if (taskDetailOpen) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            if (taskDetailOpen) {
              event.preventDefault()
            }
          }}
          onFocusOutside={(event) => {
            if (taskDetailOpen) {
              event.preventDefault()
            }
          }}
          onEscapeKeyDown={(event) => {
            if (taskDetailOpen) {
              event.preventDefault()
            }
          }}
        >
          {selectedDay ? (
            <>
              <DialogHeader className="gap-1 border-b px-4 pt-[max(1rem,var(--k-safe-area-top))] pb-4 pr-14 text-left sm:pt-4">
                <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                  Tareas del día
                </p>
                <DialogTitle className="text-lg capitalize">{formatLongDate(selectedDay)}</DialogTitle>
                <DialogDescription>
                  {selectedTasks.length === 0
                    ? "Sin tareas este día con los filtros actuales."
                    : `${selectedTasks.length} tarea${selectedTasks.length === 1 ? "" : "s"} · toca una para ver el detalle`}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {selectedTasks.length > 0 ? (
                  <ul className="flex flex-col gap-2 pb-2">
                    <AnimatePresence initial={false}>
                      {selectedTasks.map((task, index) => (
                        <motion.li
                          key={task.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04 }}
                        >
                          <TaskItem task={task} onOpen={onOpenTask} />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                ) : (
                  <p className="rounded-xl bg-muted/50 px-4 py-10 text-center text-sm text-muted-foreground">
                    No hay tareas para este día.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
