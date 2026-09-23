import { ChevronRight, MessageCircle } from "lucide-react"
import type { AssistantMessage } from "@/lib/assistantChatEvents"
import { cn } from "@/lib/utils"

const snippet = (message: AssistantMessage) => {
  const text = message.text.replace(/\s+/g, " ").trim()
  if (text) {
    return text.length > 52 ? `${text.slice(0, 52)}…` : text
  }
  if (message.attachment) {
    return message.attachment.title || "Archivo adjunto"
  }
  return ""
}

type HomeConversationPreviewProps = {
  messages: AssistantMessage[]
  title?: string | null
  live?: boolean
  onOpenChat: () => void
  className?: string
}

export const HomeConversationPreview = ({
  messages,
  title,
  live = false,
  onOpenChat,
  className,
}: HomeConversationPreviewProps) => {
  const withContent = messages.filter((message) => message.text.trim() || message.attachment)
  const last = withContent.at(-1)
  if (!last) {
    return null
  }

  const fromUser = last.role === "user"

  return (
    <button
      type="button"
      onClick={onOpenChat}
      className={cn(
        "flex w-full items-center gap-2 border-b border-border/60 px-4 py-2 text-left transition-colors hover:bg-muted/35",
        className,
      )}
    >
      <MessageCircle className="size-3.5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-xs leading-tight">
        <span className="font-medium text-foreground">{title?.trim() || "Conversación"}</span>
        <span className="text-muted-foreground">
          {" · "}
          {fromUser ? "Tú" : "Isi"}: {snippet(last)}
        </span>
      </p>
      {live ? (
        <span className="shrink-0 rounded-full bg-primary/12 px-1.5 py-px text-[9px] font-semibold text-primary">
          Vivo
        </span>
      ) : null}
      <span className="inline-flex shrink-0 items-center gap-px text-[10px] font-medium text-primary">
        Chat
        <ChevronRight className="size-3" aria-hidden />
      </span>
    </button>
  )
}
