import { type FormEvent, useCallback, useEffect, useState } from "react"
import { AlignLeft, CalendarClock, Pencil, Plus, Trash2, Type } from "lucide-react"
import { FieldLabel } from "@/components/FieldLabel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useTaskSocket } from "@/hooks/useTaskSocket"
import { applyTaskSocketEvent } from "@/lib/taskSocket"
import {
  createTask,
  deleteTask,
  formatTaskDueAt,
  listTasks,
  toDatetimeLocalValue,
  updateTask,
  type Task,
} from "@/lib/tasks"

const SHOW_MANUAL_TASK_FORM = false

export const TaskBoard = () => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadTasks = async () => {
    const data = await listTasks()
    setTasks(data.tasks)
  }

  const onSocketEvent = useCallback((event: Parameters<typeof applyTaskSocketEvent>[1]) => {
    setTasks((current) => applyTaskSocketEvent(current, event))
    if (event.type === "task.deleted") {
      setEditingId((current) => {
        if (current !== event.id) {
          return current
        }
        setTitle("")
        setDescription("")
        setDueAt("")
        return null
      })
    }
  }, [])

  useTaskSocket(onSocketEvent)

  useEffect(() => {
    let cancelled = false
    listTasks()
      .then((data) => {
        if (!cancelled) {
          setTasks(data.tasks)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudieron cargar las tareas")
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const resetForm = () => {
    setTitle("")
    setDescription("")
    setDueAt("")
    setEditingId(null)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle) {
      setError("El título es obligatorio")
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (editingId === null) {
        await createTask(nextTitle, description.trim(), dueAt || null)
      } else {
        await updateTask(editingId, {
          title: nextTitle,
          description: description.trim(),
          dueAt: dueAt || null,
        })
      }
      await loadTasks()
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la tarea")
    } finally {
      setSaving(false)
    }
  }

  const onEdit = (task: Task) => {
    setEditingId(task.id)
    setTitle(task.title)
    setDescription(task.description)
    setDueAt(toDatetimeLocalValue(task.dueAt))
    setError(null)
  }

  const onDelete = async (task: Task) => {
    if (!window.confirm(`¿Eliminar “${task.title}”?`)) {
      return
    }
    setError(null)
    try {
      await deleteTask(task.id)
      if (editingId === task.id) {
        resetForm()
      }
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la tarea")
    }
  }

  return (
    <section className="flex w-full flex-1 flex-col gap-5 rounded-xl border bg-card p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Tareas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {SHOW_MANUAL_TASK_FORM
            ? editingId === null
              ? "Créalas aquí o pídaselas a EC."
              : "Editando una tarea."
            : "Pídele una tarea a EC."}
        </p>
      </div>

      <form
        className={SHOW_MANUAL_TASK_FORM ? "grid gap-3" : "hidden"}
        onSubmit={onSubmit}
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="task-title" icon={Type}>
            Título
          </FieldLabel>
          <Input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="task-description" icon={AlignLeft}>
            Descripción
          </FieldLabel>
          <Textarea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="task-due-at" icon={CalendarClock}>
            Fecha y hora
          </FieldLabel>
          <Input
            id="task-due-at"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </div>
        {SHOW_MANUAL_TASK_FORM && error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            <Plus data-icon="inline-start" />
            {saving ? "Guardando…" : editingId === null ? "Crear tarea" : "Guardar cambios"}
          </Button>
          {editingId !== null ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>

      {!SHOW_MANUAL_TASK_FORM && error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando tareas…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-48">Fecha y hora</TableHead>
              <TableHead className="w-28 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No hay tareas todavía.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.title}</TableCell>
                  <TableCell className="whitespace-pre-wrap text-muted-foreground">
                    {task.description || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatTaskDueAt(task.dueAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit(task)}
                        aria-label={`Editar ${task.title}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onDelete(task)}
                        aria-label={`Eliminar ${task.title}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
