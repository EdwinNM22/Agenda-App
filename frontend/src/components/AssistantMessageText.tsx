import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown"
import remarkGfm from "remark-gfm"
import { useAssistantMessagePresentation } from "@/components/AssistantMessagePresentation"
import { AssistantReplyShimmer } from "@/components/AssistantReplyShimmer"

const AssistantMarkdown = () => (
  <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} className="assistant-markdown text-foreground" smooth />
)

export const AssistantMessageText = () => {
  const { showShimmer, showTypewriter, showMarkdown, typed, showCaret } =
    useAssistantMessagePresentation()

  if (showShimmer) {
    return <AssistantReplyShimmer />
  }

  if (showTypewriter) {
    return (
      <span className="block text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        {typed}
        {showCaret ? (
          <span className="assistant-caret ml-0.5 inline-block text-muted-foreground" aria-hidden />
        ) : null}
      </span>
    )
  }

  if (showMarkdown) {
    return <AssistantMarkdown />
  }

  return null
}
