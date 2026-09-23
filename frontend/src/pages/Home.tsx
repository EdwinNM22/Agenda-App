import { useEffect, useMemo, useState } from "react"
import { ArrowRight } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { AssistantComposer } from "@/components/AssistantComposer"
import { TaskCreatingCard } from "@/components/BusyState"
import { TaskDetailSheet } from "@/components/TaskDetailSheet"
import { TaskItem } from "@/components/TaskItem"
import { useAuth } from "@/lib/auth"
import { HomeGreetingTitle } from "@/components/HomeGreetingTitle"
import { useHomeGreeting } from "@/hooks/useHomeGreeting"
import { ASSISTANT_SUGGESTIONS } from "@/lib/assistantSuggestions"
import { useAssistantSheet } from "@/lib/assistantSheet"
import { useTasks } from "@/lib/tasks-store"
import { useVoiceAssistant } from "@/lib/voice-assistant"
import type { Task } from "@/lib/tasks"

export const HomePage = () => {
  const { pathname } = useLocation()
  const { openSheet } = useAssistantSheet()
  const { user } = useAuth()
  const { tasks, loading, reload } = useTasks()
  const { sendText, activity } = useVoiceAssistant()
  const { greeting, loading: greetingLoading } = useHomeGreeting(user?.id, user?.name ?? "")
  const [selected, setSelected] = useState<Task | null>(null)
  const creating = activity === "create_task"

  const pending = useMemo(
    () => tasks.filter((task) => (task.status ?? "pending") === "pending"),
    [tasks],
  )
  const preview = pending.slice(0, 5)

  useEffect(() => {
    if (!selected) {
      return
    }
    const next = tasks.find((item) => item.id === selected.id)
    setSelected(next ?? null)
  }, [tasks, selected?.id])

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-5 pt-[calc(var(--k-safe-area-top)+2.75rem)] pb-8">
      <header className="px-1 text-center">
        <HomeGreetingTitle greeting={greeting} loading={greetingLoading} />
      </header>

      <AssistantComposer variant="hero" className="mt-8" />

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {ASSISTANT_SUGGESTIONS.map((suggestion) => {
          const Icon = suggestion.Icon
          return (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => {
                void sendText(suggestion.prompt)
                openSheet()
              }}
              className="inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-2.5 text-left text-sm font-medium shadow-sm transition-colors hover:bg-muted/70"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{suggestion.label}</span>
            </button>
          )
        })}
      </div>

      <section className="mt-10 flex flex-col gap-3">
        <div className="flex items-center gap-2 px-0.5">
          <h2 className="text-lg font-semibold tracking-tight">Tus tareas pendientes</h2>
          {pending.length > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white">
              {pending.length}
            </span>
          ) : null}
          <Link
            to="/tareas"
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
          >
            Ver todas
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {creating ? <TaskCreatingCard /> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando agenda…</p>
        ) : pending.length === 0 && !creating ? (
          <p className="rounded-[1.5rem] border bg-card px-4 py-5 text-sm text-muted-foreground shadow-sm">
            No tienes tareas pendientes. Pídele a Isi que cree una.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {preview.map((task) => (
              <li key={task.id}>
                <TaskItem task={task} onOpen={setSelected} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <TaskDetailSheet
        task={selected}
        open={selected !== null && pathname === "/"}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
        onChanged={reload}
      />
    </main>
  )
}
