import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowUp, Mic, PhoneOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ComposerSuggestionChips } from "@/components/ComposerSuggestionChips"
import { HomeConversationPreview } from "@/components/HomeConversationPreview"
import { useAssistantSheet } from "@/lib/assistantSheet"
import { useVoiceAssistant } from "@/lib/voice-assistant"
import { cn } from "@/lib/utils"

type AssistantComposerProps = {
  variant: "hero" | "bar"
  onEngage?: () => void
  className?: string
}

export const AssistantComposer = ({ variant, onEngage, className }: AssistantComposerProps) => {
  const { openSheet } = useAssistantSheet()
  const { start, sendText, hangUp, live, status, textStatus, hearingUser, messages, conversationTitle } =
    useVoiceAssistant()
  const [value, setValue] = useState("")
  const connecting = status === "connecting" || textStatus === "connecting"
  const voiceSession = live || status === "connecting"
  const canSend = value.trim().length > 0 && status !== "connecting"
  const hero = variant === "hero"
  const hasConversation = useMemo(
    () => hero && messages.some((message) => message.text.trim() || message.attachment),
    [hero, messages],
  )
  const heroPlaceholder = hasConversation
    ? "Sigue la conversación con Isi…"
    : "Escribe lo que buscas o haz una pregunta"

  const submitText = () => {
    const text = value.trim()
    if (!text || connecting) {
      return
    }
    setValue("")
    void sendText(text)
    if (hero) {
      openSheet()
    }
    onEngage?.()
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    submitText()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      submitText()
    }
  }

  const pickSuggestion = (prompt: string) => {
    void sendText(prompt)
    if (hero) {
      openSheet()
    }
    onEngage?.()
  }

  const handleMic = () => {
    if (voiceSession) {
      hangUp()
      onEngage?.()
      return
    }
    if (hero) {
      openSheet()
    }
    if (!connecting) {
      void start()
    }
    onEngage?.()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(hero ? "flex flex-col" : "flex items-end gap-2", className)}
      aria-label={hasConversation ? "Continuar conversación con Isi" : "Iniciar conversación con Isi"}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden bg-card shadow-sm",
          hero
            ? cn(
                "rounded-[1.75rem] border",
                hasConversation
                  ? "border-primary/20 pb-12 ring-1 ring-primary/8"
                  : "px-3.5 pt-3 pb-3.5",
              )
            : "flex min-h-12 flex-1 items-end rounded-[1.35rem] border px-3.5 py-2.5",
        )}
      >
        {hasConversation ? (
          <HomeConversationPreview
            messages={messages}
            title={conversationTitle}
            live={live}
            onOpenChat={() => openSheet()}
          />
        ) : null}
        {hero && !hasConversation ? (
          <>
            <div className="flex items-start gap-1.5">
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={heroPlaceholder}
                className="min-h-9 max-h-20 flex-1 resize-none bg-transparent py-1 text-[15px] leading-snug text-foreground outline-none placeholder:text-muted-foreground field-sizing-content"
              />
              <div className="flex shrink-0 items-center gap-1 pt-0.5">
                <Button
                  type="button"
                  variant={voiceSession ? "destructive" : "ghost"}
                  size="icon"
                  className={cn(
                    "size-9 rounded-full",
                    voiceSession
                      ? "glass-danger border shadow-sm"
                      : "assistant-mic",
                    !voiceSession && live && "bg-primary/10 text-primary",
                    hearingUser && !voiceSession && "ring-2 ring-primary/40",
                  )}
                  onClick={handleMic}
                  aria-label={voiceSession ? "Colgar" : "Hablar con Isi"}
                >
                  {voiceSession ? <PhoneOff className="size-4" /> : <Mic className="size-4" />}
                </Button>
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend}
                  className="size-9 rounded-full"
                  aria-label="Enviar"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </div>
            <ComposerSuggestionChips onPick={pickSuggestion} />
          </>
        ) : (
          <>
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={hero ? heroPlaceholder : "Escribe lo que buscas o haz una pregunta"}
              className={cn(
                "w-full resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
                hero
                  ? "min-h-9 px-4 py-2.5 text-[15px] leading-snug"
                  : "field-sizing-content max-h-28 min-h-6 py-0.5 text-base leading-relaxed",
              )}
            />
            {hero ? (
              <div className="absolute right-3 bottom-2 flex items-center gap-1.5">
                <Button
                  type="button"
                  variant={voiceSession ? "destructive" : "ghost"}
                  size="icon"
                  className={cn(
                    "size-10 rounded-full",
                    voiceSession
                      ? "glass-danger border shadow-sm"
                      : "assistant-mic",
                    !voiceSession && live && "bg-primary/10 text-primary",
                    hearingUser && !voiceSession && "ring-2 ring-primary/40",
                  )}
                  onClick={handleMic}
                  aria-label={voiceSession ? "Colgar" : "Hablar con Isi"}
                >
                  {voiceSession ? <PhoneOff className="size-5" /> : <Mic className="size-5" />}
                </Button>
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend}
                  className="size-10 rounded-full"
                  aria-label="Enviar"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {hero ? null : (
        <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
          <Button
            type="button"
            variant={voiceSession ? "destructive" : "ghost"}
            size="icon"
            className={cn(
              "size-11 rounded-full border shadow-sm",
              voiceSession ? "glass-danger" : "assistant-mic bg-card",
              !voiceSession && live && "bg-primary/10 text-primary",
              hearingUser && !voiceSession && "ring-2 ring-primary/40",
            )}
            onClick={handleMic}
            aria-label={voiceSession ? "Colgar" : "Hablar con Isi"}
          >
            {voiceSession ? <PhoneOff className="size-5" /> : <Mic className="size-5" />}
          </Button>
          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            className="size-11 rounded-full shadow-sm"
            aria-label="Enviar"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      )}
    </form>
  )
}
