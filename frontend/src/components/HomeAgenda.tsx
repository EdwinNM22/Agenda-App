import { useEffect, useState } from "react"
import { ArrowRight, CalendarDays } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { TaskDetailSheet } from "@/components/TaskDetailSheet"
import { TaskItem } from "@/components/TaskItem"
import { groupHomeTasks, type Task } from "@/lib/tasks"

type HomeAgendaProps = {
  tasks: Task[]
  loading: boolean
  onChanged: () => Promise<void> | void
}

export const HomeAgenda = ({ tasks, loading, onChanged }: HomeAgendaProps) => {
  const sections = groupHomeTasks(tasks)
  const hasAny = sections.some((section) => section.tasks.length > 0)
  const { pathname } = useLocation()
  const [selected, setSelected] = useState<Task | null>(null)

  useEffect(() => {
    if (!selected) {
      return
    }
    const next = tasks.find((item) => item.id === selected.id)
    setSelected(next ?? null)
  }, [tasks, selected?.id])

  return (
    <section className="flex flex-col gap-6 px-5 pt-8 pb-2">
      <div className="flex justify-end">
        <Link
          to="/tareas"
          className="glass-surface inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium"
        >
          Ver todas
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando agenda…</p>
      ) : !hasAny ? (
        <p className="text-sm text-muted-foreground">
          No hay tareas para hoy, mañana ni el resto de la semana.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <div key={section.id} className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between px-0.5">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  <CalendarDays className="size-3" />
                  {section.title}
                </h3>
                <span className="text-xs text-muted-foreground">{section.tasks.length}</span>
              </div>
              {section.tasks.length === 0 ? (
                <p className="glass-surface rounded-2xl border px-4 py-3 text-sm text-muted-foreground">Nada aún</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {section.tasks.map((task) => (
                    <li key={task.id}>
                      <TaskItem task={task} onOpen={setSelected} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <TaskDetailSheet
        task={selected}
        open={selected !== null && pathname === "/"}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
        onChanged={onChanged}
      />
    </section>
  )
}
