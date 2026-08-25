import { useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { CalendarDays, CheckSquare, LayoutList, ListTodo, Search, X } from "lucide-react"
import { es } from "date-fns/locale"
import { AnimatePresence, motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TaskCreatingCard } from "@/components/BusyState"
import { TaskDetailSheet } from "@/components/TaskDetailSheet"
import { TaskItem } from "@/components/TaskItem"
import { useTasks } from "@/hooks/useTasks"
import { useVoiceAssistant } from "@/lib/voice-assistant"
import { TASK_STATUS_VISUAL } from "@/lib/taskStatus"
import {
  datesByTaskStatus,
  filterTasksByDay,
  formatLongDate,
  getTaskGroup,
  TASK_GROUPS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from "@/lib/tasks"

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

export const TasksPage = () => {
  const { pathname } = useLocation()
  const { tasks, loading, error, setError, reload } = useTasks()
  const { activity } = useVoiceAssistant()
  const creating = activity === "create_task"
  const [filterDay, setFilterDay] = useState<Date | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all")
  const [selected, setSelected] = useState<Task | null>(null)

  useEffect(() => {
    if (!selected) {
      return
    }
    const next = tasks.find((item) => item.id === selected.id)
    setSelected(next ?? null)
  }, [tasks, selected?.id])

  const daysByStatus = useMemo(() => datesByTaskStatus(tasks), [tasks])
  const visibleTasks = useMemo(() => {
    const byDay = filterDay ? filterTasksByDay(tasks, filterDay) : tasks
    const byStatus =
      statusFilter === "all"
        ? byDay
        : byDay.filter((task) => (task.status ?? "pending") === statusFilter)
    const needle = normalizeSearch(query)
    if (!needle) {
      return byStatus
    }
    return byStatus.filter((task) =>
      normalizeSearch(`${task.title} ${task.description}`).includes(needle),
    )
  }, [filterDay, query, statusFilter, tasks])

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(TASK_GROUPS.map((group) => [group.id, [] as Task[]])) as Record<
      (typeof TASK_GROUPS)[number]["id"],
      Task[]
    >
    for (const task of visibleTasks) {
      buckets[getTaskGroup(task.dueAt)].push(task)
    }
    return TASK_GROUPS.map((group) => ({ ...group, tasks: buckets[group.id] })).filter(
      (group) => group.tasks.length > 0,
    )
  }, [visibleTasks])

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-5 pt-[calc(var(--k-safe-area-top)+2rem)]">
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
        <ListTodo className="size-7" />
        Agenda
      </h1>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en la agenda"
            className="glass-surface h-11 rounded-full border pr-10 pl-9"
            aria-label="Buscar en la agenda"
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <X />
            </Button>
          ) : null}
        </div>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={filterDay ? "default" : "outline"}
              size="icon-lg"
              className="glass-surface size-11 shrink-0 rounded-full [&_svg]:size-5"
              aria-label="Filtrar por día"
            >
              <CalendarDays />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3">
            <Calendar
              mode="single"
              locale={es}
              selected={filterDay ?? undefined}
              onSelect={(day) => {
                setFilterDay(day ?? null)
                setCalendarOpen(false)
              }}
              modifiers={daysByStatus}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          type="button"
          size="sm"
          variant={statusFilter === "all" ? "default" : "outline"}
          className="glass-surface rounded-full"
          onClick={() => setStatusFilter("all")}
        >
          <LayoutList data-icon="inline-start" />
          Todas
        </Button>
        {TASK_STATUSES.map((status) => {
          const StatusIcon = TASK_STATUS_VISUAL[status].icon
          return (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={statusFilter === status ? "default" : "outline"}
            className="glass-surface rounded-full"
            onClick={() => setStatusFilter(status)}
          >
            <StatusIcon data-icon="inline-start" />
            {TASK_STATUS_LABELS[status]}
          </Button>
          )
        })}
      </div>

      {filterDay ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/70 px-3 py-2">
          <p className="text-sm font-medium capitalize">{formatLongDate(filterDay)}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setFilterDay(null)}>
            <X data-icon="inline-start" />
            Todas
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {creating ? <TaskCreatingCard /> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando tareas…</p>
      ) : tasks.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border bg-card px-6 py-16 text-center shadow-sm">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <CheckSquare className="size-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Todavía no hay tareas</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            En Home, pídele a EC que cree una. Aparecerá aquí al instante.
          </p>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="rounded-3xl border bg-card px-6 py-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            {query.trim() ? "No hay tareas que coincidan con la búsqueda." : "No hay tareas con este filtro."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {grouped.map((group) => (
            <section key={group.id} className="flex flex-col gap-3">
              <h2 className="px-1 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                {group.title}
              </h2>
              <ul className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {group.tasks.map((task) => (
                    <motion.li
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                    >
                      <TaskItem
                        task={task}
                        onOpen={setSelected}
                        className={
                          group.id === "overdue" && (task.status ?? "pending") === "pending"
                            ? "border-destructive/30"
                            : undefined
                        }
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </div>
      )}

      <TaskDetailSheet
        task={selected}
        open={selected !== null && pathname === "/tareas"}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
        onChanged={async () => {
          setError(null)
          await reload()
        }}
      />
    </main>
  )
}
