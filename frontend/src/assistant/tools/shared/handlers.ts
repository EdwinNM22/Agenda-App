import { api } from "@/lib/api"
import { assetUrl } from "@/lib/apiBase"
import { buildReportFromSession } from "@/lib/buildReportFromSession"
import { finishTool, sendToolResult, tryParseToolArgs } from "../runtime"
import type { RealtimeToolHandlers, ToolRunResult } from "../types"

export const runGenerateReportPdf = async (
  channel: RTCDataChannel,
  callId: string,
  rawArgs: string,
  handlers?: RealtimeToolHandlers,
): Promise<ToolRunResult> => {
  const parsed = tryParseToolArgs(rawArgs) ?? {}

  const title = typeof parsed.title === "string" ? parsed.title.trim() : undefined
  const subtitle = typeof parsed.subtitle === "string" ? parsed.subtitle.trim() : undefined
  const fileName = typeof parsed.fileName === "string" ? parsed.fileName : undefined
  const sourceRaw = typeof parsed.source === "string" ? parsed.source.trim().toLowerCase() : "last"
  const source =
    sourceRaw === "tasks" ||
    sourceRaw === "prestamo" ||
    sourceRaw === "banco" ||
    sourceRaw === "all" ||
    sourceRaw === "last"
      ? sourceRaw
      : "last"

  const embedded = parsed.report
  let report: unknown = null

  if (embedded && typeof embedded === "object") {
    const asReport = embedded as { title?: unknown; sections?: unknown }
    if (typeof asReport.title === "string" && Array.isArray(asReport.sections) && asReport.sections.length > 0) {
      report = embedded
    }
  }

  if (!report) {
    const built = buildReportFromSession({ title, subtitle, source })
    if ("error" in built) {
      console.warn("[Isi] generate_report_pdf sin datos de sesión", {
        argsLen: rawArgs.length,
        source,
        message: built.error,
      })
      return finishTool(channel, callId, { ok: false, message: built.error })
    }
    report = built.report
  }

  try {
    const result = await api<{
      ok?: boolean
      url?: string
      fileName?: string
      title?: string
      bytes?: number
      message?: string
    }>("/api/reports/pdf", {
      method: "POST",
      body: JSON.stringify({
        report,
        fileName,
      }),
    })

    if (!result.ok || !result.url || !result.fileName || !result.title) {
      return finishTool(channel, callId, {
        ok: false,
        message: result.message ?? "No se pudo generar el PDF",
      })
    }

    const url = assetUrl(result.url)
    handlers?.onReportGenerated?.({
      url,
      fileName: result.fileName,
      title: result.title,
    })

    return finishTool(channel, callId, {
      ok: true,
      url,
      fileName: result.fileName,
      title: result.title,
      bytes: result.bytes,
      instruccion:
        "The PDF is in the user's chat. Confirm briefly in the user's language. Do not read the full PDF aloud.",
    })
  } catch (error) {
    console.warn("[Isi] generate_report_pdf API error", error)
    return finishTool(channel, callId, {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo generar el PDF",
    })
  }
}

export const runEndCall = (
  channel: RTCDataChannel,
  callId: string,
  handlers?: RealtimeToolHandlers,
) => {
  if (handlers?.shouldEndCall && !handlers.shouldEndCall()) {
    sendToolResult(channel, callId, {
      ok: false,
      message: "No cuelgues: el usuario no se despidió.",
    })
    handlers.onAwaitingResponse?.()
    return
  }

  sendToolResult(channel, callId, { ok: true })
  window.setTimeout(() => handlers?.onHangUp?.(), 800)
}
