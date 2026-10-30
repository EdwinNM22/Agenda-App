import type { RealtimeChannel } from "@/lib/realtimeChannel"
import { formatToolResultMarkdown } from "@/lib/toolResultMarkdown"
import { APP_DISPLAY_NOTE } from "../runtime/reply-language"
import type { ToolRunResult } from "./types.js"

export type { RealtimeChannel }

export const sendEvent = (channel: RealtimeChannel, payload: unknown) => {
  if (channel.readyState !== "open") {
    return
  }
  channel.send(JSON.stringify(payload))
}

/**
 * Coordina cuándo el modelo responde tras ejecutar tools.
 *
 * Antes cada resultado disparaba su propio `response.create`: con varias tools en el mismo
 * turno (o una respuesta aún abierta) el modelo hablaba entre medias («ok, tengo la lista…»).
 * Ahora se envía UN solo `response.create` cuando ya no queda ninguna tool pendiente y no hay
 * otra respuesta en curso.
 */
type ToolReplyState = {
  /** Tool calls registradas que aún no terminaron. */
  pending: number
  /** Hay al menos un resultado esperando respuesta del modelo. */
  wanted: boolean
  /** Hay una respuesta del modelo en curso. */
  active: boolean
  watchdog: number
}

/** Si una respuesta nunca cierra (evento perdido), no dejamos al usuario sin contestación. */
const ACTIVE_RESPONSE_TIMEOUT_MS = 8_000

const replyStates = new WeakMap<RealtimeChannel, ToolReplyState>()
const callNames = new Map<string, string>()

const stateFor = (channel: RealtimeChannel): ToolReplyState => {
  let state = replyStates.get(channel)
  if (!state) {
    state = { pending: 0, wanted: false, active: false, watchdog: 0 }
    replyStates.set(channel, state)
  }
  return state
}

const sendReply = (channel: RealtimeChannel, state: ToolReplyState) => {
  window.clearTimeout(state.watchdog)
  state.wanted = false
  state.active = true
  // Sin `instructions`: sustituirían las de la sesión (estilo, idioma, modo voz) en esta respuesta.
  sendEvent(channel, { type: "response.create" })
}

const flushToolReply = (channel: RealtimeChannel) => {
  const state = stateFor(channel)
  if (!state.wanted || state.pending > 0) {
    return
  }
  if (!state.active) {
    sendReply(channel, state)
    return
  }
  window.clearTimeout(state.watchdog)
  state.watchdog = window.setTimeout(() => {
    if (state.wanted && state.pending === 0) {
      state.active = false
      sendReply(channel, state)
    }
  }, ACTIVE_RESPONSE_TIMEOUT_MS)
}

/** Registra las tool calls de un evento antes de ejecutarlas, para no responder a medias. */
export const beginToolCalls = (
  channel: RealtimeChannel,
  calls: Array<{ callId: string; name: string }>,
) => {
  if (calls.length === 0) {
    return
  }
  stateFor(channel).pending += calls.length
  for (const call of calls) {
    callNames.set(call.callId, call.name)
  }
}

export const settleToolCall = (channel: RealtimeChannel, callId: string) => {
  const state = stateFor(channel)
  state.pending = Math.max(0, state.pending - 1)
  callNames.delete(callId)
  flushToolReply(channel)
}

/** Sigue el ciclo de vida de las respuestas del modelo para no solaparlas. */
export const trackResponseLifecycle = (channel: RealtimeChannel, eventType: string | undefined) => {
  if (eventType === "response.created") {
    stateFor(channel).active = true
    return
  }
  if (eventType === "response.done") {
    const state = stateFor(channel)
    state.active = false
    flushToolReply(channel)
  }
}

const withAppDisplayNote = (callId: string, output: unknown): unknown => {
  const toolName = callNames.get(callId)
  if (!toolName || !output || typeof output !== "object" || Array.isArray(output)) {
    return output
  }
  const record = output as Record<string, unknown>
  if (!formatToolResultMarkdown(toolName, record)) {
    return output
  }
  return { ...record, app_display: APP_DISPLAY_NOTE }
}

export const sendToolResult = (channel: RealtimeChannel, callId: string, output: unknown) => {
  const wireOutput = withAppDisplayNote(callId, output)
  sendEvent(channel, {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(wireOutput),
    },
  })
  const state = stateFor(channel)
  state.wanted = true
  flushToolReply(channel)
}

export const finishTool = (
  channel: RealtimeChannel,
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
