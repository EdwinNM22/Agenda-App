import { cn } from "@/lib/utils"

type AssistantReplyShimmerProps = {
  className?: string
}

/** Shimmer dentro de la burbuja de carga (altura fija vía `.assistant-reply-bubble-body--loading`). */
export const AssistantReplyShimmer = ({ className }: AssistantReplyShimmerProps) => (
  <div className={cn("flex w-full flex-col justify-center gap-2", className)} aria-hidden>
    <div className="busy-shimmer h-3.5 w-full rounded-lg" />
    <div className="busy-shimmer h-3.5 w-[92%] rounded-lg opacity-55" />
    <div className="busy-shimmer h-3 w-[72%] rounded-lg opacity-40" />
    <span className="sr-only">Isi está preparando la respuesta…</span>
  </div>
)
