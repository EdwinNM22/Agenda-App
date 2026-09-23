/** Registro de sistemas del asistente en el frontend. */
export {
  AGENDA_TOOL_NAMES,
  ATLAS_TOOL_NAMES,
  BANCO_TOOL_NAMES,
  BIOVIZION_ALBUMS_TOOL_NAMES,
  SHARED_TOOL_NAMES,
} from "../tools/types"

export const ASSISTANT_SYSTEMS = {
  agenda: {
    id: "agenda",
    toolNames: ["create_task", "list_tasks", "update_task", "delete_task"] as const,
  },
  atlas: {
    id: "atlas",
    toolNames: ["query_prestamo"] as const,
  },
  banco: {
    id: "banco",
    toolNames: ["query_banco", "create_banco_movimiento"] as const,
  },
  biovizionAlbums: {
    id: "biovizion-albums",
    toolNames: ["query_biovizion"] as const,
  },
} as const
