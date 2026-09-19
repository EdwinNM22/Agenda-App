import { AGENDA_INSTRUCTIONS } from "../prompts/agenda.js"
import { AGENDA_TOOLS } from "../tools/agenda.tools.js"
import type { AssistantSystemModule } from "../types.js"

export const agendaSystem: AssistantSystemModule = {
  id: "agenda",
  instructions: () => AGENDA_INSTRUCTIONS,
  tools: AGENDA_TOOLS,
}
