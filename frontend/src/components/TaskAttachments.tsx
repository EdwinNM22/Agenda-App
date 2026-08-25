import { useRef, useState } from "react"
import { FileText, Paperclip, Plus, Trash2 } from "lucide-react"
import { BusyOverlay, BusySpinner } from "@/components/BusyState"
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

type PendingUpload = {
  id: string
  name: string
  size: number
  image: boolean
  preview: string | null
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
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const attachments = task.attachments ?? []
  const images = attachments.filter(isImageAttachment)
  const files = attachments.filter((item) => !isImageAttachment(item))
  const pendingImages = pending.filter((item) => item.image)
  const pendingFiles = pending.filter((item) => !item.image)
  const empty = attachments.length === 0 && pending.length === 0

  const onPick = () => inputRef.current?.click()

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) {
      return
    }
    const next = Array.from(list).map((file) => {
      const image = file.type.startsWith("image/")
      return {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        image,
        preview: image ? URL.createObjectURL(file) : null,
        file,
      }
    })
    setPending(next.map(({ file: _file, ...item }) => item))
    setBusy(true)
    setError(null)
    try {
      for (const item of next) {
        await uploadTaskAttachment(task.id, item.file)
      }
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo")
      try {
        await onChanged()
      } catch {
        // el listado se sincroniza en el siguiente intento
      }
    } finally {
      for (const item of next) {
        if (item.preview) {
          URL.revokeObjectURL(item.preview)
        }
      }
      setPending([])
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
    setRemovingId(attachment.id)
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
      setRemovingId(null)
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2" aria-busy={busy}>
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
          disabled={busy || attachments.length + pending.length >= 10}
        >
          {busy && pending.length > 0 ? (
            <>
              <BusySpinner className="size-3.5" />
              Subiendo
            </>
          ) : (
            <>
              <Plus data-icon="inline-start" />
              Añadir
            </>
          )}
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

      {empty ? (
        <p className="text-sm text-muted-foreground">Sin archivos todavía.</p>
      ) : (
        <div className="grid gap-3">
          {images.length > 0 || pendingImages.length > 0 ? (
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
                  {removingId === attachment.id ? (
                    <BusyOverlay className="rounded-2xl" label="Quitando" />
                  ) : (
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/55 text-white"
                      onClick={() => void onRemove(attachment)}
                      disabled={busy}
                      aria-label={`Quitar ${attachment.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {pendingImages.map((item) => (
                <div key={item.id} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                  {item.preview ? (
                    <img src={item.preview} alt="" className="size-full object-cover opacity-80" />
                  ) : (
                    <div className="busy-shimmer size-full" />
                  )}
                  <BusyOverlay className="rounded-2xl" label="Subiendo" />
                </div>
              ))}
            </div>
          ) : null}

          {files.length > 0 || pendingFiles.length > 0 ? (
            <ul className="grid gap-2">
              {files.map((attachment) => (
                <li key={attachment.id}>
                  <div className="relative flex items-center gap-2 rounded-2xl border bg-muted/40 px-3 py-2">
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
                      disabled={busy}
                      aria-label={`Quitar ${attachment.name}`}
                    >
                      <Trash2 />
                    </Button>
                    {removingId === attachment.id ? (
                      <BusyOverlay className="rounded-2xl" label="Quitando" />
                    ) : null}
                  </div>
                </li>
              ))}
              {pendingFiles.map((item) => (
                <li key={item.id}>
                  <div className="relative flex items-center gap-2 rounded-2xl border bg-muted/40 px-3 py-2">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <FileText className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Subiendo…</p>
                    </div>
                    <BusySpinner className="size-4 text-muted-foreground" />
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
