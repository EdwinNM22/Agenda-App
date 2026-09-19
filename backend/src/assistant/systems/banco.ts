import { BANCO_INSTRUCTIONS } from "../prompts/banco.js"
import { BANCO_TOOLS } from "../tools/banco.tools.js"
import type { AssistantSystemModule } from "../types.js"

export const bancoSystem: AssistantSystemModule = {
  id: "banco",
  instructions: () => BANCO_INSTRUCTIONS,
  tools: BANCO_TOOLS,
}
