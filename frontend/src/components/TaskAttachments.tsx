import { useRef, useState } from "react"
import { FileText, Paperclip, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TaskImageLightbox } from "@/components/TaskImageLightbox"
import { TaskPdfViewer } from "@/components/TaskPdfViewer"
import {
  attachmentThumbUrl,
  deleteTaskAttachment,
  isImageAttachment,
  isPdfAttachment,
  uploadTaskAttachment,
  type Task,
  type TaskAttachment,
} from "@/lib/tasks"

type TaskAttachmentsProps = {
  task: Task
  onChanged: () => Promise<void> | void
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const TaskAttachments = ({ task, onChanged }: TaskAttachmentsProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [pdf, setPdf] = useState<TaskAttachment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attachments = task.attachments ?? []
  const images = attachments.filter(isImageAttachment)
  const files = attachments.filter((item) => !isImageAttachment(item))

  const onPick = () => inputRef.current?.click()

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(list)) {
        await uploadTaskAttachment(task.id, file)
      }
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo")
    } finally {
      setBusy(false)
      if (inputRef.current) {
        inputRef.current.value = ""
      }
    }
  }

  const onRemove = async (attachment: TaskAttachment) => {
    if (!window.confirm(`¿Quitar “${attachment.name}”?`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteTaskAttachment(task.id, attachment.id)
      await onChanged()
      if (lightboxIndex !== null && images[lightboxIndex]?.id === attachment.id) {
        setLightboxIndex(null)
      }
      if (pdf?.id === attachment.id) {
        setPdf(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el archivo")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="size-3.5 opacity-80" />
          Archivos
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-full"
          onClick={onPick}
          disabled={busy || attachments.length >= 10}
        >
          <Plus data-icon="inline-start" />
          Añadir
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.txt,.zip,.docx,.xlsx"
        multiple
        onChange={(event) => void onFiles(event.target.files)}
      />

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin archivos todavía.</p>
      ) : (
        <div className="grid gap-3">
          {images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {images.map((attachment, index) => (
                <div key={attachment.id} className="relative">
                  <button
                    type="button"
                    className="block aspect-square w-full overflow-hidden rounded-2xl bg-muted"
                    onClick={() => setLightboxIndex(index)}
                  >
                    <img
                      src={attachmentThumbUrl(attachment)}
                      alt={attachment.name}
                      className="size-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/55 text-white"
                    onClick={() => void onRemove(attachment)}
                    aria-label={`Quitar ${attachment.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {files.length > 0 ? (
            <ul className="grid gap-2">
              {files.map((attachment) => (
                <li key={attachment.id}>
                  <div className="flex items-center gap-2 rounded-2xl border bg-muted/40 px-3 py-2">
                    {isPdfAttachment(attachment) ? (
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => setPdf(attachment)}
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate text-sm">{attachment.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatSize(attachment.size)}
                        </span>
                      </button>
                    ) : (
                      <a
                        href={attachment.url}
                        download={attachment.name}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate text-sm">{attachment.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatSize(attachment.size)}
                        </span>
                      </a>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void onRemove(attachment)}
                      aria-label={`Quitar ${attachment.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <TaskImageLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
      <TaskPdfViewer file={pdf} onClose={() => setPdf(null)} />
    </div>
  )
}
