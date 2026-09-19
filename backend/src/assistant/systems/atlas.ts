import { buildAtlasInstructions } from "../prompts/atlas.js"
import { ATLAS_TOOLS } from "../tools/atlas.tools.js"
import type { AssistantSystemModule } from "../types.js"

export const atlasSystem: AssistantSystemModule = {
  id: "atlas",
  instructions: buildAtlasInstructions,
  tools: ATLAS_TOOLS,
}
