import { agendaSystem } from "./agenda.js"
import { atlasSystem } from "./atlas.js"
import { bancoSystem } from "./banco.js"
import { biovizionAlbumsSystem } from "./biovizion-albums.js"
import type { AssistantSystemModule } from "../types.js"

/** Sistemas activos del asistente. BiovizionAlbums está preparado pero aún sin funcionalidad. */
export const ACTIVE_ASSISTANT_SYSTEMS: AssistantSystemModule[] = [
  agendaSystem,
  atlasSystem,
  bancoSystem,
]

/** Todos los sistemas registrados, incluidos los pendientes de implementación. */
export const ALL_ASSISTANT_SYSTEMS: AssistantSystemModule[] = [
  agendaSystem,
  atlasSystem,
  bancoSystem,
  biovizionAlbumsSystem,
]

export { agendaSystem, atlasSystem, bancoSystem, biovizionAlbumsSystem }
