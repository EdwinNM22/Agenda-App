import { COMPOSER_TAG_SUGGESTIONS, type ComposerTagSuggestion } from "@/lib/assistantSuggestions"

type ComposerSuggestionChipsProps = {
  onPick: (prompt: string) => void
}

const Tag = ({
  suggestion,
  onPick,
}: {
  suggestion: ComposerTagSuggestion
  onPick: (prompt: string) => void
}) => {
  const Icon = suggestion.Icon
  return (
    <button
      type="button"
      title={suggestion.label}
      onClick={() => onPick(suggestion.prompt)}
      className="composer-tag-chip inline-flex items-center gap-1 rounded-full border border-border/75 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/65"
    >
      <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="whitespace-nowrap">{suggestion.chipLabel}</span>
    </button>
  )
}

/** Etiquetas en hasta 2 filas, ancho natural, sin scroll. */
export const ComposerSuggestionChips = ({ onPick }: ComposerSuggestionChipsProps) => (
  <div className="composer-tag-cloud mt-2.5">
    {COMPOSER_TAG_SUGGESTIONS.map((suggestion) => (
      <Tag key={suggestion.id} suggestion={suggestion} onPick={onPick} />
    ))}
  </div>
)
