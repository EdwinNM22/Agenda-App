import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist"
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { TaskAttachment } from "@/lib/tasks"

GlobalWorkerOptions.workerSrc = pdfWorker

type TaskPdfViewerProps = {
  file: TaskAttachment | null
  onClose: () => void
}

const outputScale = () =>
  typeof window === "undefined" ? 2 : Math.min(Math.max(window.devicePixelRatio || 2, 2), 3)

export const TaskPdfViewer = ({ file, onClose }: TaskPdfViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [width, setWidth] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
    setPageCount(0)
    setError(null)
    setPdf(null)
    if (!file) {
      return
    }
    let cancelled = false
    const task = getDocument(file.url)
    setLoading(true)
    task.promise
      .then((document) => {
        if (cancelled) {
          void document.destroy()
          return
        }
        setPdf(document)
        setPageCount(document.numPages)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError("No se pudo abrir el PDF")
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [file?.id, file?.url])

  useEffect(() => {
    if (!container) {
      return
    }
    const updateWidth = () => {
      setWidth(Math.max(280, Math.floor(container.clientWidth)))
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [container, file])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!pdf || !canvas || width <= 0) {
      return
    }
    let cancelled = false
    let renderTask: RenderTask | null = null
    const draw = async () => {
      const pdfPage = await pdf.getPage(page)
      if (cancelled) {
        return
      }
      const scale = width / pdfPage.getViewport({ scale: 1 }).width
      const viewport = pdfPage.getViewport({ scale })
      const ratio = outputScale()
      const context = canvas.getContext("2d", { alpha: false })
      if (!context) {
        return
      }
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      renderTask = pdfPage.render({
        canvas: null,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        intent: "display",
      })
      await renderTask.promise
    }
    void draw().catch(() => {
      if (!cancelled) {
        setError("No se pudo mostrar la página")
      }
    })
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pdf, page, width])

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 z-[90] flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 transform-none flex-col gap-0 rounded-none bg-zinc-950 p-0 text-white data-open:zoom-in-100 data-closed:zoom-out-100 sm:top-0 sm:left-0 sm:h-dvh sm:max-w-none sm:translate-x-0 sm:translate-y-0"
      >
        <div className="flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium text-white">
            {file?.name ?? "PDF"}
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full text-white hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X />
          </Button>
        </div>
        <div ref={setContainer} className="task-pdf-page min-h-0 flex-1 overflow-auto">
          {error ? (
            <p className="p-6 text-center text-sm text-red-300">{error}</p>
          ) : loading ? (
            <p className="p-6 text-center text-sm text-white/70">Cargando PDF…</p>
          ) : (
            <canvas ref={canvasRef} className="mx-auto block bg-white" />
          )}
        </div>
        {pageCount > 0 ? (
          <div className="flex items-center justify-center gap-3 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-full text-white hover:bg-white/10 hover:text-white"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft />
            </Button>
            <p className="text-xs text-white/80">
              {page} / {pageCount}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-full text-white hover:bg-white/10 hover:text-white"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              aria-label="Página siguiente"
            >
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
