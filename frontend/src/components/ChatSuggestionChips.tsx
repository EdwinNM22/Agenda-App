import { Sparkles } from "lucide-react"
import type { ChatFollowUpSuggestion } from "@/lib/chatSuggestions"
import { cn } from "@/lib/utils"

type ChatSuggestionChipsProps = {
  suggestions: ChatFollowUpSuggestion[]
  onPick: (message: string) => void
  className?: string
  disabled?: boolean
}

/** Etiquetas cortas en pantalla; al pulsar se envía message completo. */
export const ChatSuggestionChips = ({
  suggestions,
  onPick,
  className,
  disabled = false,
}: ChatSuggestionChipsProps) => {
  if (suggestions.length === 0) {
    return null
  }

  return (
    <div
      className={cn("composer-tag-cloud chat-suggestion-cloud", className)}
      role="group"
      aria-label="Sugerencias de seguimiento"
    >
      {suggestions.map((suggestion) => (
        <button
          key={`${suggestion.label}:${suggestion.message}`}
          type="button"
          disabled={disabled}
          title={suggestion.message}
          onClick={() => onPick(suggestion.message)}
          className="composer-tag-chip inline-flex shrink-0 items-center gap-1 rounded-full border border-border/75 bg-muted/40 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted/65 disabled:pointer-events-none disabled:opacity-50"
        >
          <Sparkles className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          <span>{suggestion.label}</span>
        </button>
      ))}
    </div>
  )
}
