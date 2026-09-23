import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react"
import { Download, FileText } from "lucide-react"
import { motion } from "motion/react"
import { activityLabel, BusyDots } from "@/components/BusyState"
import { AssistantMessageText } from "@/components/AssistantMessageText"
import {
  AssistantMessagePresentationProvider,
  useAssistantMessagePresentation,
} from "@/components/AssistantMessagePresentation"
import { AssistantReplyBubbleShell } from "@/components/AssistantReplyBubbleShell"
import { AssistantReplyShimmer } from "@/components/AssistantReplyShimmer"
import { TaskPdfViewer, type PdfViewerFile } from "@/components/TaskPdfViewer"
import { Button } from "@/components/ui/button"
import type { AssistantMessage, AssistantPdfAttachment } from "@/lib/assistantChatEvents"
import { ChatSuggestionChips } from "@/components/ChatSuggestionChips"
import { useChatSuggestions } from "@/hooks/useChatSuggestions"
import { useVoiceAssistant } from "@/lib/voice-assistant"
import { cn } from "@/lib/utils"

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(timestamp)

const convertMessage = (message: AssistantMessage): ThreadMessageLike => {
  const role = message.role === "user" ? "user" : "assistant"
  const assistantStatus = message.streaming
    ? ({ type: "running" } as const)
    : ({ type: "complete", reason: "stop" } as const)
  const textPart = message.text || (message.streaming && role === "assistant")
  return {
    id: message.id,
    role,
    content: textPart ? [{ type: "text", text: message.text }] : [],
    createdAt: new Date(message.createdAt),
    ...(role === "assistant" ? { status: assistantStatus } : {}),
  }
}

const AssistantMessageMeta = () => {
  const createdAt = useAuiState((state) => state.message.createdAt)
  const { showMarkdown } = useAssistantMessagePresentation()

  if (!showMarkdown) {
    return null
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="font-medium tracking-wide uppercase">Isi</span>
      <span>{formatTime(createdAt?.getTime() ?? Date.now())}</span>
    </div>
  )
}

const HiddenMessage = () => null

const UserMessageBubble = () => (
  <motion.article
    initial={{ opacity: 0, y: 10, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ type: "spring", stiffness: 420, damping: 34 }}
    className="flex w-full justify-end"
  >
    <MessagePrimitive.Root className="max-w-[85%] rounded-[1.35rem] rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  </motion.article>
)

type ChatExtras = {
  attachmentsById: Map<string, AssistantPdfAttachment>
  onOpenPdf: (file: PdfViewerFile) => void
}

const ChatExtrasContext = createContext<ChatExtras>({
  attachmentsById: new Map(),
  onOpenPdf: () => undefined,
})

const ReportPdfCard = ({
  attachment,
  onOpen,
}: {
  attachment: AssistantPdfAttachment
  onOpen: (file: PdfViewerFile) => void
}) => (
  <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/40 px-3 py-3">
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-foreground shadow-sm">
        <FileText className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{attachment.title}</p>
        <p className="truncate text-xs text-muted-foreground">{attachment.fileName}</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 rounded-full px-3 text-xs"
        onClick={() => onOpen({ url: attachment.url, name: attachment.fileName })}
      >
        Abrir
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full px-3 text-xs" asChild>
        <a href={attachment.url} download={attachment.fileName} target="_blank" rel="noreferrer">
          <Download className="size-3.5" aria-hidden />
          Descargar
        </a>
      </Button>
    </div>
  </div>
)

/** Stable component identity — do not wrap in an inline factory (causes remount/flicker while streaming). */
const assistantMessageText = (content: unknown) => {
  if (!Array.isArray(content)) {
    return ""
  }
  return content
    .map((part) => {
      if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part) {
        return String(part.text ?? "")
      }
      return ""
    })
    .join("")
}

const AssistantMessageBubbleFrame = ({
  attachment,
  onOpenPdf,
}: {
  attachment?: AssistantPdfAttachment
  onOpenPdf: (file: PdfViewerFile) => void
}) => {
  const running = useAuiState((state) => state.message.status?.type === "running")
  const { showShimmer } = useAssistantMessagePresentation()

  return (
    <motion.article
      initial={running ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="flex w-full justify-start"
    >
      <MessagePrimitive.Root asChild>
        <AssistantReplyBubbleShell loading={showShimmer} streaming={running}>
          <MessagePrimitive.Parts components={{ Text: AssistantMessageText }} />
          {attachment ? <ReportPdfCard attachment={attachment} onOpen={onOpenPdf} /> : null}
          <AssistantMessageMeta />
        </AssistantReplyBubbleShell>
      </MessagePrimitive.Root>
    </motion.article>
  )
}

const AssistantMessageBubble = () => {
  const running = useAuiState((state) => state.message.status?.type === "running")
  const messageId = useAuiState((state) => state.message.id)
  const plainText = useAuiState((state) => assistantMessageText(state.message.content))
  const { attachmentsById, onOpenPdf } = useContext(ChatExtrasContext)
  const attachment = messageId ? attachmentsById.get(messageId) : undefined

  return (
    <AssistantMessagePresentationProvider
      messageId={messageId}
      text={plainText}
      running={running}
    >
      <AssistantMessageBubbleFrame attachment={attachment} onOpenPdf={onOpenPdf} />
    </AssistantMessagePresentationProvider>
  )
}

const AssistantLoadingBubble = () => (
  <div className="flex w-full justify-start">
    <AssistantReplyBubbleShell loading>
      <AssistantReplyShimmer />
    </AssistantReplyBubbleShell>
  </div>
)

const StatusBubble = ({ children }: { children: ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-surface inline-flex max-w-full rounded-[1.25rem] rounded-bl-md border bg-card/92 px-4 py-3 text-sm text-muted-foreground shadow-sm backdrop-blur-md"
  >
    {children}
  </motion.div>
)

const threadComponents = {
  AssistantMessage: AssistantMessageBubble,
  UserMessage: UserMessageBubble,
  EditComposer: HiddenMessage,
  UserEditComposer: HiddenMessage,
}

const AssistantChatThread = ({
  messages,
  isRunning,
  onOpenPdf,
}: {
  messages: AssistantMessage[]
  isRunning: boolean
  onOpenPdf: (file: PdfViewerFile) => void
}) => {
  const attachmentsById = useMemo(() => {
    const map = new Map<string, AssistantPdfAttachment>()
    for (const message of messages) {
      if (message.attachment) {
        map.set(message.id, message.attachment)
      }
    }
    return map
  }, [messages])

  const extras = useMemo(
    () => ({ attachmentsById, onOpenPdf }),
    [attachmentsById, onOpenPdf],
  )

  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage,
    isRunning,
    isDisabled: true,
    onNew: async () => undefined,
  })

  return (
    <ChatExtrasContext.Provider value={extras}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="flex flex-col gap-4">
          <ThreadPrimitive.Viewport className="flex flex-col gap-4">
            <ThreadPrimitive.Messages components={threadComponents} />
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </ChatExtrasContext.Provider>
  )
}

export const AssistantChat = ({ className }: { className?: string }) => {
  const { messages, live, busy, activity, status, textStatus, error, sendText } = useVoiceAssistant()
  const endRef = useRef<HTMLDivElement>(null)
  const [pdfFile, setPdfFile] = useState<PdfViewerFile | null>(null)
  const streaming = useMemo(() => messages.some((message) => message.streaming), [messages])
  const waitingForReply = useMemo(() => {
    const last = messages.at(-1)
    if (messages.some((message) => message.streaming && !message.text.trim())) {
      return true
    }
    if (activity) {
      return false
    }
    if (busy && messages.length > 0 && last?.role === "user") {
      return true
    }
    if (live && busy && !streaming) {
      return true
    }
    if (textStatus === "connecting" && messages.length > 0) {
      return true
    }
    return false
  }, [activity, busy, live, messages, streaming, textStatus])
  const chatEmpty = messages.length === 0
  const suggestionsReady = !chatEmpty && !streaming && !waitingForReply && !activity
  const { suggestions, clearSuggestions } = useChatSuggestions(messages, {
    enabled: suggestionsReady,
  })

  const pickSuggestion = (text: string) => {
    clearSuggestions()
    void sendText(text)
  }

  const emptyHint = useMemo(() => {
    if (error) {
      return { kind: "error" as const, text: error }
    }
    if (status === "connecting") {
      return { kind: "status" as const, text: "Conectando voz" }
    }
    if (textStatus === "connecting") {
      return { kind: "status" as const, text: "Conectando chat" }
    }
    const toolLabel = activityLabel(activity)
    if (toolLabel) {
      return { kind: "status" as const, text: toolLabel }
    }
    if (waitingForReply) {
      return { kind: "loading" as const }
    }
    if (!live) {
      return { kind: "idle" as const, text: "Escribe o toca el micrófono para hablar con Isi" }
    }
    return null
  }, [activity, error, live, status, textStatus, waitingForReply])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, waitingForReply, activity, emptyHint, suggestions.length])

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col px-5 pt-1", className)}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain pb-3">
        {chatEmpty ? (
          <div className="flex flex-1 flex-col justify-end gap-1.5 pb-3">
            {emptyHint?.kind === "error" ? (
              <p className="text-sm text-destructive">{emptyHint.text}</p>
            ) : emptyHint?.kind === "status" ? (
              <StatusBubble>{emptyHint.text}</StatusBubble>
            ) : emptyHint?.kind === "loading" ? (
              <AssistantLoadingBubble />
            ) : emptyHint?.kind === "idle" ? (
              <p className="text-xs font-medium text-muted-foreground">{emptyHint.text}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">Las respuestas de Isi aparecerán aquí.</p>
            <p className="text-xs leading-relaxed text-muted-foreground/80">
              Texto, listas o tablas según lo que necesites saber.
            </p>
          </div>
        ) : (
          <AssistantChatThread
            messages={messages}
            isRunning={streaming || waitingForReply}
            onOpenPdf={setPdfFile}
          />
        )}

        {!chatEmpty && activity ? (
          <StatusBubble>
            {activityLabel(activity) ?? "Preparando respuesta"}
            <BusyDots />
          </StatusBubble>
        ) : null}

        {!chatEmpty && suggestions.length > 0 ? (
          <ChatSuggestionChips
            suggestions={suggestions}
            onPick={pickSuggestion}
            disabled={streaming || waitingForReply || Boolean(activity)}
            className="mt-1"
          />
        ) : null}

        <div ref={endRef} className="h-4 shrink-0" aria-hidden />
      </div>

      <TaskPdfViewer file={pdfFile} onClose={() => setPdfFile(null)} />
    </section>
  )
}
