import { type FormEvent, useEffect, useRef, useState } from "react"
import { AlignLeft, CalendarClock, Pencil, Trash2, Type } from "lucide-react"
import { FieldLabel } from "@/components/FieldLabel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { TaskAttachments } from "@/components/TaskAttachments"
import { TaskStatusSelect } from "@/components/TaskStatusSelect"
import {
  deleteTask,
  toDatetimeLocalValue,
  updateTask,
  type Task,
  type TaskStatus,
} from "@/lib/tasks"

type TaskDetailSheetProps = {
  task: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<void> | void
}

export const TaskDetailSheet = ({ task, open, onOpenChange, onChanged }: TaskDetailSheetProps) => {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [status, setStatus] = useState<TaskStatus>("pending")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSaveRef = useRef(false)

  useEffect(() => {
    if (!task || !open) {
      setEditing(false)
      canSaveRef.current = false
      return
    }
    setTitle(task.title)
    setDescription(task.description)
    setDueAt(toDatetimeLocalValue(task.dueAt))
    setStatus(task.status ?? "pending")
    setError(null)
    setEditing(false)
    canSaveRef.current = false
  }, [task?.id, open])

  const onStatusChange = async (next: TaskStatus) => {
    setStatus(next)
    if (!task || editing) {
      return
    }
    setError(null)
    try {
      await updateTask(task.id, { status: next })
      await onChanged()
    } catch (err) {
      setStatus(task.status ?? "pending")
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado")
    }
  }

  const startEditing = () => {
    canSaveRef.current = false
    window.setTimeout(() => {
      setEditing(true)
      window.setTimeout(() => {
        canSaveRef.current = true
      }, 250)
    }, 0)
  }

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!task || !editing || !canSaveRef.current) {
      return
    }
    const nextTitle = title.trim()
    if (!nextTitle) {
      setError("El título es obligatorio")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateTask(task.id, {
        title: nextTitle,
        description: description.trim(),
        dueAt: dueAt || null,
        status,
      })
      await onChanged()
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la tarea")
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!task || !window.confirm(`¿Eliminar “${task.title}”?`)) {
      return
    }
    setError(null)
    try {
      await deleteTask(task.id)
      await onChanged()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la tarea")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="z-60 max-h-[88vh] gap-0 overflow-y-auto rounded-t-3xl pb-[calc(var(--k-safe-area-bottom)+1rem)]"
      >
        {task ? (
          <form onSubmit={onSave}>
            <SheetHeader className="border-b">
              <div className="flex items-start justify-between gap-3">
                <SheetTitle className="flex min-w-0 items-center gap-2">
                  <Pencil className="size-4" />
                  {editing ? "Editar tarea" : "Detalle"}
                </SheetTitle>
                <TaskStatusSelect value={status} onChange={onStatusChange} />
              </div>
            </SheetHeader>

            <div className="grid gap-4 px-4 py-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor="task-detail-title" icon={Type}>
                  Título
                </FieldLabel>
                <Input
                  id="task-detail-title"
                  className="h-11"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  required
                  disabled={!editing}
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="task-detail-description" icon={AlignLeft}>
                  Descripción
                </FieldLabel>
                <Textarea
                  id="task-detail-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  disabled={!editing}
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="task-detail-due" icon={CalendarClock}>
                  Fecha y hora
                </FieldLabel>
                <Input
                  id="task-detail-due"
                  className="h-10 max-w-[16.5rem] text-sm"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  disabled={!editing}
                />
              </div>
              <TaskAttachments task={task} onChanged={onChanged} />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <SheetFooter className="flex-row gap-2">
              {editing ? (
                <>
                  <Button type="submit" className="h-11 flex-1" disabled={saving}>
                    {saving ? "Guardando…" : "Guardar cambios"}
                  </Button>
                  <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setEditing(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" className="h-11 flex-1" onClick={startEditing}>
                    <Pencil data-icon="inline-start" />
                    Editar
                  </Button>
                  <Button type="button" variant="destructive" className="h-11 flex-1" onClick={onDelete}>
                    <Trash2 data-icon="inline-start" />
                    Eliminar
                  </Button>
                </>
              )}
            </SheetFooter>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
