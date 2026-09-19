import type { ToolRunResult } from "./types.js"

export const sendEvent = (channel: RTCDataChannel, payload: unknown) => {
  if (channel.readyState !== "open") {
    return
  }
  channel.send(JSON.stringify(payload))
}

export const sendToolResult = (channel: RTCDataChannel, callId: string, output: unknown) => {
  sendEvent(channel, {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(output),
    },
  })
  sendEvent(channel, { type: "response.create" })
}

export const finishTool = (
  channel: RTCDataChannel,
  callId: string,
  output: Record<string, unknown>,
  context?: { resource?: string },
): ToolRunResult => {
  sendToolResult(channel, callId, output)
  return { output, context }
}

export const tryParseToolArgs = (rawArgs: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(rawArgs) as unknown
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
  } catch {
    const start = rawArgs.indexOf("{")
    const end = rawArgs.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(rawArgs.slice(start, end + 1)) as unknown
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
      } catch {
        return null
      }
    }
    return null
  }
}
