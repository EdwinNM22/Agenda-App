import { buildBiovizionAlbumsInstructions } from "../prompts/biovizion-albums.js"
import { BIOVIZION_ALBUMS_TOOLS } from "../tools/biovizion-albums.tools.js"
import type { AssistantSystemModule } from "../types.js"

export const biovizionAlbumsSystem: AssistantSystemModule = {
  id: "biovizion-albums",
  instructions: buildBiovizionAlbumsInstructions,
  tools: BIOVIZION_ALBUMS_TOOLS,
}
