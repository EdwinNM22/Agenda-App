import { useState } from "react"
import { CalendarClock, FileText } from "lucide-react"
import { TaskImageLightbox } from "@/components/TaskImageLightbox"
import { TaskPdfViewer } from "@/components/TaskPdfViewer"
import { TaskStatusMark, TASK_STATUS_VISUAL } from "@/lib/taskStatus"
import {
  attachmentThumbUrl,
  formatTaskWhen,
  isPdfAttachment,
  taskFiles,
  taskImages,
  type Task,
} from "@/lib/tasks"
import { cn } from "@/lib/utils"

type TaskItemProps = {
  task: Task
  onOpen: (task: Task) => void
  className?: string
}

export const TaskItem = ({ task, onOpen, className }: TaskItemProps) => {
  const status = task.status ?? "pending"
  const visual = TASK_STATUS_VISUAL[status]
  const images = taskImages(task)
  const imagePreviews = images.slice(0, 2)
  const files = taskFiles(task)
  const pdfs = files.filter(isPdfAttachment)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [pdf, setPdf] = useState<(typeof files)[number] | null>(null)

  return (
    <>
      <div
        className={cn(
          "relative flex w-full items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-left shadow-sm",
          className,
        )}
      >
        <button
          type="button"
          className="absolute inset-0 rounded-2xl"
          onClick={() => onOpen(task)}
          aria-label={task.title}
        />
        <div className="pointer-events-none relative flex min-w-0 items-center gap-2.5">
          <TaskStatusMark status={status} />
          <div className="min-w-0">
            <p className={cn("truncate font-medium", visual.title)}>{task.title}</p>
            {task.description ? (
              <p className={cn("mt-0.5 truncate text-sm", visual.description)}>{task.description}</p>
            ) : null}
          </div>
        </div>
        <span className="relative flex shrink-0 items-center gap-2">
          {imagePreviews.length > 0 || files.length > 0 ? (
            <span className="flex -space-x-2">
              {imagePreviews.map((attachment, index) => (
                <button
                  key={attachment.id}
                  type="button"
                  className="relative z-10 size-8 overflow-hidden rounded-full ring-2 ring-card"
                  onClick={() => setLightboxIndex(index)}
                  aria-label={
                    images.length > 1
                      ? `Ver fotos de ${task.title}`
                      : `Ver foto de ${task.title}`
                  }
                >
                  <img
                    src={attachmentThumbUrl(attachment)}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  {index === 1 && images.length > 2 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-semibold text-white">
                      +{images.length - 2}
                    </span>
                  ) : null}
                </button>
              ))}
              {files.length > 0 ? (
                pdfs.length > 0 ? (
                  <button
                    type="button"
                    className="relative z-10 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-card"
                    onClick={() => setPdf(pdfs[0] ?? null)}
                    aria-label={`Ver PDF de ${task.title}`}
                  >
                    <FileText className="size-3.5" />
                    {files.length > 1 ? (
                      <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground">
                        {files.length}
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <span
                    className="pointer-events-none relative flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-card"
                    aria-hidden
                  >
                    <FileText className="size-3.5" />
                    {files.length > 1 ? (
                      <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground">
                        {files.length}
                      </span>
                    ) : null}
                  </span>
                )
              ) : null}
            </span>
          ) : null}
          <span className="pointer-events-none inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" />
            {formatTaskWhen(task.dueAt)}
          </span>
        </span>
      </div>
      <TaskImageLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
      <TaskPdfViewer file={pdf} onClose={() => setPdf(null)} />
    </>
  )
}
