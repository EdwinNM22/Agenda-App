import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type AssistantReplyBubbleShellProps = {
  loading?: boolean
  streaming?: boolean
  className?: string
  children: ReactNode
}

/** Burbuja de Isi: tamaño fijo mientras carga; crece solo cuando ya hay texto. */
export const AssistantReplyBubbleShell = ({
  loading = false,
  streaming = false,
  className,
  children,
}: AssistantReplyBubbleShellProps) => (
  <div
    className={cn(
      "glass-surface rounded-[1.35rem] rounded-bl-md border bg-card/92 px-4 py-3.5 shadow-sm backdrop-blur-md",
      loading
        ? "assistant-reply-bubble--loading w-[min(17.5rem,100%)]"
        : "max-w-full min-w-0 w-full",
      streaming && "assistant-bubble-streaming",
      className,
    )}
  >
    <div
      className={cn(
        "assistant-reply-bubble-body min-w-0",
        loading && "assistant-reply-bubble-body--loading",
      )}
    >
      {children}
    </div>
  </div>
)
