import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type BusySpinnerProps = {
  className?: string
}

export const BusySpinner = ({ className }: BusySpinnerProps) => (
  <span className={cn("busy-spinner size-5", className)} aria-hidden />
)

export const BusyDots = () => (
  <span className="busy-dots" aria-hidden>
    <span />
    <span />
    <span />
  </span>
)

type BusyOverlayProps = {
  label?: string
  className?: string
}

export const BusyOverlay = ({ label, className }: BusyOverlayProps) => (
  <div
    className={cn(
      "busy-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-black/45 text-white backdrop-blur-[3px]",
      className,
    )}
    role="status"
    aria-live="polite"
    aria-label={label}
  >
    <BusySpinner className="size-6 text-white" />
    {label ? <span className="px-2 text-center text-[11px] font-medium leading-tight">{label}</span> : null}
  </div>
)

type ActivityPillProps = {
  children: ReactNode
  className?: string
}

export const ActivityPill = ({ children, className }: ActivityPillProps) => (
  <div
    role="status"
    aria-live="polite"
    className={cn(
      "glass-surface inline-flex items-center gap-2 rounded-full border bg-card/90 px-3.5 py-1.5 text-sm font-medium shadow-sm",
      className,
    )}
  >
    <BusySpinner className="size-3.5" />
    <span>
      {children}
      <BusyDots />
    </span>
  </div>
)

export const ACTIVITY_LABEL: Record<string, string> = {
  create_task: "Creando tarea",
  update_task: "Actualizando tarea",
  delete_task: "Eliminando tarea",
  query_prestamo: "Consultando Atlas",
  generate_report_pdf: "Generando PDF",
}

export const activityLabel = (activity: string | null) =>
  activity ? (ACTIVITY_LABEL[activity] ?? null) : null

type TaskCreatingCardProps = {
  className?: string
}

export const TaskCreatingCard = ({ className }: TaskCreatingCardProps) => (
  <div
    className={cn(
      "relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border bg-card px-4 py-3 text-left shadow-sm",
      className,
    )}
    role="status"
    aria-live="polite"
    aria-label="Creando tarea"
  >
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
      <BusySpinner className="size-4 text-foreground" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="font-medium">
        Creando tarea
        <BusyDots />
      </p>
      <div className="busy-shimmer mt-1.5 h-2 w-28 rounded-full" />
    </div>
  </div>
)
