import { useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { CheckSquare, LayoutList, ListTodo, Search, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { AgendaCalendar } from "@/components/AgendaCalendar"
import { TaskCreatingCard } from "@/components/BusyState"
import { TaskDetailSheet } from "@/components/TaskDetailSheet"
import { TaskItem } from "@/components/TaskItem"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTasks } from "@/hooks/useTasks"
import { useVoiceAssistant } from "@/lib/voice-assistant"
import { TASK_STATUS_VISUAL } from "@/lib/taskStatus"
import {
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

const filterVisibleTasks = (
  tasks: Task[],
  statusFilter: TaskStatus | "all",
  query: string,
): Task[] => {
  const byStatus =
    statusFilter === "all"
      ? tasks
      : tasks.filter((task) => (task.status ?? "pending") === statusFilter)
  const needle = normalizeSearch(query)
  if (!needle) {
    return byStatus
  }
  return byStatus.filter((task) =>
    normalizeSearch(`${task.title} ${task.description}`).includes(needle),
  )
}

export const TasksPage = () => {
  const { pathname } = useLocation()
  const { tasks, loading, error, setError, reload } = useTasks()
  const { activity } = useVoiceAssistant()
  const creating = activity === "create_task"
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

  const visibleTasks = useMemo(
    () => filterVisibleTasks(tasks, statusFilter, query),
    [query, statusFilter, tasks],
  )

  const undatedTasks = useMemo(
    () => visibleTasks.filter((task) => !task.dueAt),
    [visibleTasks],
  )

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 pt-[calc(var(--k-safe-area-top)+2rem)] pb-6">
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
        <ListTodo className="size-7" />
        Agenda
      </h1>

      <div className="relative">
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
      ) : (
        <>
          <AgendaCalendar
            tasks={visibleTasks}
            taskDetailOpen={selected !== null}
            onOpenTask={setSelected}
          />

          {undatedTasks.length > 0 ? (
            <section className="flex flex-col gap-3">
              <div className="px-1">
                <h2 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Sin fecha
                </h2>
                <p className="text-sm text-muted-foreground">
                  Tareas que aún no tienen día asignado
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {undatedTasks.map((task) => (
                    <motion.li
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                    >
                      <TaskItem task={task} onOpen={setSelected} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ) : null}
        </>
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
