import { pushSessionToolData } from "@/assistant/shared/session-cache"
import { formatToolResultMarkdown } from "@/lib/toolResultMarkdown"
import {
  runCreateTask,
  runDeleteTask,
  runListTasks,
  runUpdateTask,
} from "./agenda/handlers"
import { runQueryPrestamo } from "./atlas/handlers"
import { runCreateBancoMovimiento, runQueryBanco } from "./banco/handlers"
import { runEndCall, runGenerateReportPdf } from "./shared/handlers"
import type { RealtimeEvent, RealtimeToolHandlers, ToolRunResult } from "./types"

const publishStructuredChat = (
  toolName: string,
  result: ToolRunResult,
  handlers?: RealtimeToolHandlers,
) => {
  if (!result) {
    return
  }
  if (toolName === "list_tasks" || toolName === "query_prestamo" || toolName === "query_banco") {
    pushSessionToolData(toolName, result.output)
  }
  const markdown = formatToolResultMarkdown(toolName, result.output)
  if (markdown) {
    handlers?.onStructuredChat?.(markdown)
  }
}

export const handleRealtimeToolEvent = async (
  channel: RTCDataChannel,
  event: RealtimeEvent,
  seenCallIds: Set<string>,
  handlers?: RealtimeToolHandlers,
) => {
  const calls: Array<{ callId: string; name: string; args: string }> = []

  if (event.type === "response.function_call_arguments.done" && event.call_id && event.name) {
    calls.push({
      callId: event.call_id,
      name: event.name,
      args: event.arguments ?? "{}",
    })
  }

  if (event.type === "response.done") {
    for (const item of event.response?.output ?? []) {
      if (item.type === "function_call" && item.call_id && item.name) {
        calls.push({
          callId: item.call_id,
          name: item.name,
          args: item.arguments ?? "{}",
        })
      }
    }
  }

  if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
    const item = event.item
    if (item.call_id && item.name) {
      calls.push({
        callId: item.call_id,
        name: item.name,
        args: item.arguments ?? "{}",
      })
    }
  }

  for (const call of calls) {
    if (seenCallIds.has(call.callId)) {
      continue
    }
    seenCallIds.add(call.callId)
    handlers?.onToolStart?.(call.name)
    try {
      if (call.name === "create_task") {
        await runCreateTask(channel, call.callId, call.args)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "list_tasks") {
        const result = await runListTasks(channel, call.callId, call.args)
        publishStructuredChat(call.name, result, handlers)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "update_task") {
        await runUpdateTask(channel, call.callId, call.args)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "delete_task") {
        await runDeleteTask(channel, call.callId, call.args)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "query_banco") {
        const result = await runQueryBanco(channel, call.callId, call.args)
        publishStructuredChat(call.name, result, handlers)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "create_banco_movimiento") {
        await runCreateBancoMovimiento(channel, call.callId, call.args)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "query_prestamo") {
        const result = await runQueryPrestamo(channel, call.callId, call.args)
        publishStructuredChat(call.name, result, handlers)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "generate_report_pdf") {
        await runGenerateReportPdf(channel, call.callId, call.args, handlers)
        handlers?.onAwaitingResponse?.()
      }
      if (call.name === "end_call") {
        runEndCall(channel, call.callId, handlers)
      }
    } finally {
      handlers?.onToolEnd?.(call.name)
    }
  }
}

export type { RealtimeEvent, RealtimeToolHandlers, ToolRunResult } from "./types"
export {
  AGENDA_TOOL_NAMES,
  ATLAS_TOOL_NAMES,
  BANCO_TOOL_NAMES,
  SHARED_TOOL_NAMES,
} from "./types"
