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
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { TaskItem } from "@/components/TaskItem"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
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

type DayPanelAnchor = {
  day: Date
  left: number
  top: number
  width: number
  height: number
}

const PANEL_MAX_WIDTH_PX = 512

const readSafeAreaPx = (name: "--k-safe-area-left" | "--k-safe-area-right" | "--k-safe-area-top" | "--k-safe-area-bottom") => {
  if (typeof window === "undefined") {
    return 0
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name)
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

const panelTargetWidthPx = () => {
  if (typeof window === "undefined") {
    return PANEL_MAX_WIDTH_PX
  }
  const inset =
    Math.max(16, readSafeAreaPx("--k-safe-area-left")) +
    Math.max(16, readSafeAreaPx("--k-safe-area-right"))
  return Math.min(window.innerWidth - inset, PANEL_MAX_WIDTH_PX)
}

/** Altura fija del panel (la que antes “flasheaba” al abrir por height: auto). */
const panelTargetHeightPx = () => {
  if (typeof window === "undefined") {
    return 420
  }
  const verticalInset =
    Math.max(16, readSafeAreaPx("--k-safe-area-top")) +
    Math.max(16, readSafeAreaPx("--k-safe-area-bottom")) +
    32
  const cap = window.innerHeight - verticalInset
  return Math.min(Math.round(window.innerHeight * 0.75), cap)
}

const dayPanelSpring = { type: "spring" as const, damping: 34, stiffness: 400, mass: 0.82 }

const dayPanelCenter = (anchor: DayPanelAnchor) => ({
  left: anchor.left + anchor.width / 2,
  top: anchor.top + anchor.height / 2,
})

const dayPanelExpandMotion = (anchor: DayPanelAnchor) => {
  const origin = dayPanelCenter(anchor)
  const targetWidth = panelTargetWidthPx()
  const targetHeight = panelTargetHeightPx()
  return {
    initial: {
      left: origin.left,
      top: origin.top,
      width: anchor.width,
      height: anchor.height,
      x: "-50%",
      y: "-50%",
      borderRadius: 0,
    },
    animate: {
      left: "50%",
      top: "50%",
      width: targetWidth,
      height: targetHeight,
      x: "-50%",
      y: "-50%",
      borderRadius: 16,
    },
  }
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
  const [dayPanel, setDayPanel] = useState<DayPanelAnchor | null>(null)
  const selectedDay = dayPanel?.day ?? null

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
    setDayPanel(null)
  }

  const openDayPanel = (day: Date, cell: HTMLElement) => {
    if (!isSameMonth(day, visibleMonth)) {
      setVisibleMonth(startOfMonth(day))
    }
    const rect = cell.getBoundingClientRect()
    setDayPanel({
      day,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    })
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

      <div className="-mx-1 overflow-hidden rounded-2xl border bg-card shadow-sm sm:-mx-5">
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
                const showMonthLabel = outside || day.getDate() === 1

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={(event) => openDayPanel(day, event.currentTarget)}
                    className={cn(
                      "relative flex h-[6rem] flex-col gap-0.5 overflow-hidden border-r p-0.5 text-left transition-colors last:border-r-0 sm:p-1",
                      outside && "bg-muted/20",
                      selected && dayPanel && "z-[1] ring-2 ring-inset ring-primary/40",
                      selected && !dayPanel && "z-[1] bg-primary/8 ring-2 ring-inset ring-primary/50",
                      !selected && "hover:bg-muted/35 active:bg-muted/50",
                    )}
                    aria-label={
                      dayTasks.length > 0
                        ? `${format(day, "d MMMM", { locale: es })}, ${dayTasks.length} tareas`
                        : format(day, "d MMMM", { locale: es })
                    }
                    aria-pressed={selected}
                  >
                    <span
                      className={cn(
                        "relative min-h-[1.375rem] pr-4 pl-0.5",
                        selected && dayPanel && "invisible",
                      )}
                    >
                      <span className="inline-flex max-w-full items-baseline gap-0.5 leading-none">
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center justify-center font-semibold tabular-nums",
                            today
                              ? "min-h-[1.375rem] min-w-[1.375rem] rounded-full bg-primary px-1 text-xs text-primary-foreground"
                              : "text-sm",
                            !today && outside && "text-muted-foreground",
                            !today && !outside && "text-foreground",
                          )}
                        >
                          {dayNumber}
                        </span>
                        {showMonthLabel ? (
                          <span
                            className={cn(
                              "shrink-0 text-[10px] font-medium whitespace-nowrap lowercase",
                              today ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {monthShort}
                          </span>
                        ) : null}
                      </span>
                      {pendingCount > 0 ? (
                        <span className="absolute top-0 right-0 rounded-full bg-sky-500/15 px-1 py-px text-[9px] font-semibold leading-none text-sky-700 tabular-nums dark:text-sky-300">
                          {pendingCount}
                        </span>
                      ) : dayTasks.length > 0 ? (
                        <span
                          className="absolute top-1 right-0.5 size-1.5 rounded-full bg-emerald-500"
                          aria-hidden
                        />
                      ) : null}
                    </span>

                    <span
                      className={cn(
                        "flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden",
                        selected && dayPanel && "invisible",
                      )}
                    >
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
        open={dayPanel !== null}
        modal={!taskDetailOpen}
        onOpenChange={(open) => {
          if (!open && !taskDetailOpen) {
            setDayPanel(null)
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName={cn("z-[52]", taskDetailOpen && "pointer-events-none bg-black/5 backdrop-blur-none")}
          className={cn(
            "fixed inset-0 top-0 left-0 z-[53] h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none ring-0 duration-0 data-open:animate-none data-closed:animate-none",
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
          {dayPanel && selectedDay ? (
            <motion.div
              key={localDateKey(selectedDay)}
              {...dayPanelExpandMotion(dayPanel)}
              transition={dayPanelSpring}
              className="fixed z-[54] flex flex-col overflow-hidden border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.2 }}
                className="flex h-full min-h-0 flex-col"
              >
                <DialogHeader className="shrink-0 gap-0.5 border-b px-3.5 pt-3.5 pb-3 pr-11 text-left">
                  <p className="text-[10px] font-semibold tracking-wide text-primary uppercase">
                    Tareas del día
                  </p>
                  <DialogTitle id="agenda-day-dialog-title" className="text-base capitalize">
                    {formatLongDate(selectedDay)}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {selectedTasks.length === 0
                      ? "Sin tareas este día con los filtros actuales."
                      : `${selectedTasks.length} tarea${selectedTasks.length === 1 ? "" : "s"} · toca una para ver el detalle`}
                  </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-2.5">
                  {selectedTasks.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                      <AnimatePresence initial={false}>
                        {selectedTasks.map((task, index) => (
                          <motion.li
                            key={task.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.08 + index * 0.04 }}
                          >
                            <TaskItem task={task} onOpen={onOpenTask} />
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  ) : (
                    <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                      No hay tareas para este día.
                    </p>
                  )}
                </div>
              </motion.div>

              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2.5 right-2.5 z-10 rounded-full"
                >
                  <X />
                  <span className="sr-only">Cerrar</span>
                </Button>
              </DialogClose>
            </motion.div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
