import type { RealtimeChannel } from "@/lib/realtimeChannel"
import {
  handleAssistantChatEvent,
  responseIdFrom,
  type AssistantChatController,
} from "@/lib/assistantChatEvents"
import { handleRealtimeToolEvent } from "@/lib/realtimeTools"
import type { RealtimeToolHandlers } from "@/assistant/tools/types"

export type RealtimeServerEventContext = {
  chat: AssistantChatController | null
  channel: RealtimeChannel
  seenCallIds: Set<string>
  toolHandlers: RealtimeToolHandlers
  onResponseCreated?: (responseId: string) => void
  onResponseDone?: () => void
}

export const handleRealtimeServerEvent = (
  event: Record<string, unknown>,
  ctx: RealtimeServerEventContext,
) => {
  const type = typeof event.type === "string" ? event.type : ""

  if (type === "response.created") {
    ctx.onResponseCreated?.(responseIdFrom(event))
  }
  if (type === "response.done") {
    ctx.onResponseDone?.()
  }

  handleAssistantChatEvent(event, ctx.chat)
  void handleRealtimeToolEvent(ctx.channel, event, ctx.seenCallIds, ctx.toolHandlers)
}
