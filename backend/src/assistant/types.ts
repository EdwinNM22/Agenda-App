export type SessionContext = {
  userName: string
  now: string
  today: string
  tomorrow: string
}

export type RealtimeTool = {
  type: "function"
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type AssistantSystemModule = {
  id: string
  instructions: (ctx: SessionContext) => string[]
  tools: RealtimeTool[]
}
