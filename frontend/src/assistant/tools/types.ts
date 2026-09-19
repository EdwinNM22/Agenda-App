export type RealtimeEvent = {
  type?: string
  name?: string
  call_id?: string
  arguments?: string
  item?: {
    type?: string
    name?: string
    call_id?: string
    arguments?: string
  }
  response?: {
    output?: Array<{
      type?: string
      name?: string
      call_id?: string
      arguments?: string
    }>
  }
}

export type ToolRunResult = {
  output: Record<string, unknown>
  context?: { resource?: string }
} | null

export type RealtimeToolHandlers = {
  onHangUp?: () => void
  onToolStart?: (name: string) => void
  onToolEnd?: (name: string) => void
  onAwaitingResponse?: () => void
  shouldEndCall?: () => boolean
  onReportGenerated?: (report: { url: string; fileName: string; title: string }) => void
  onStructuredChat?: (markdown: string) => void
}

/** Herramientas del sistema Agenda. */
export const AGENDA_TOOL_NAMES = ["create_task", "list_tasks", "update_task", "delete_task"] as const

/** Herramientas del sistema Atlas. */
export const ATLAS_TOOL_NAMES = ["query_prestamo"] as const

/** Herramientas del sistema Banco. */
export const BANCO_TOOL_NAMES = ["query_banco", "create_banco_movimiento"] as const

/** Herramientas compartidas (no pertenecen a un sistema específico). */
export const SHARED_TOOL_NAMES = ["generate_report_pdf", "end_call"] as const

export type AgendaToolName = (typeof AGENDA_TOOL_NAMES)[number]
export type AtlasToolName = (typeof ATLAS_TOOL_NAMES)[number]
export type BancoToolName = (typeof BANCO_TOOL_NAMES)[number]
export type SharedToolName = (typeof SHARED_TOOL_NAMES)[number]

export type AssistantToolName = AgendaToolName | AtlasToolName | BancoToolName | SharedToolName
