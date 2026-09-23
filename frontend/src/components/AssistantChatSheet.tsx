import { AssistantChat } from "@/components/AssistantChat"
import { AssistantComposer } from "@/components/AssistantComposer"
import { AssistantOrb } from "@/components/AssistantOrb"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useAssistantSheet } from "@/lib/assistantSheet"
import { useVoiceAssistant } from "@/lib/voice-assistant"

const SheetHeaderIcon = ({ voiceActive }: { voiceActive: boolean }) => {
  if (voiceActive) {
    return (
      <div className="relative size-11 shrink-0 overflow-hidden rounded-full">
        <AssistantOrb size={44} className="pointer-events-none" disabled />
      </div>
    )
  }

  return (
    <div
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary"
      aria-hidden
    >
      I
    </div>
  )
}

export const AssistantChatSheet = () => {
  const { open, closeSheet } = useAssistantSheet()
  const { live, status, textStatus, hearingUser, conversationTitle } = useVoiceAssistant()
  const voiceActive = live || status === "connecting"

  const voiceStatusLine = () => {
    if (status === "connecting") {
      return "Conectando voz…"
    }
    if (hearingUser) {
      return "Te está escuchando"
    }
    if (live) {
      return "En vivo"
    }
    if (textStatus === "connecting") {
      return "Conectando…"
    }
    return null
  }

  const headerTitle = conversationTitle?.trim() || "Isi"
  const subtitle = voiceActive || textStatus === "connecting" ? voiceStatusLine() : null

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeSheet()
        }
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton
        className="assistant-chat-sheet z-[70] flex w-full flex-col gap-0 overflow-hidden rounded-t-[1.75rem] border-t p-0 pb-[max(var(--k-safe-area-bottom),0.75rem)] sm:mx-auto sm:max-w-lg"
      >
        <div className="flex shrink-0 flex-col items-center pt-2 pb-1">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/25" aria-hidden />
        </div>

        <header className="flex shrink-0 items-center gap-3 overflow-hidden px-5 pr-14 pb-2">
          <SheetHeaderIcon voiceActive={voiceActive} />
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="truncate text-lg font-semibold tracking-tight">{headerTitle}</h2>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AssistantChat className="min-h-0 flex-1" />
          <div className="shrink-0 border-t bg-popover/95 px-5 pt-2 pb-1 backdrop-blur-sm">
            <AssistantComposer variant="bar" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
