export type SessionToolSnapshot = {
  tool: "list_tasks" | "query_prestamo"
  at: number
  output: Record<string, unknown>
}

const MAX_SNAPSHOTS = 8

let snapshots: SessionToolSnapshot[] = []

export const clearSessionToolData = () => {
  snapshots = []
}

export const pushSessionToolData = (
  tool: SessionToolSnapshot["tool"],
  output: Record<string, unknown>,
) => {
  if (output.ok === false) {
    return
  }
  snapshots = [...snapshots.filter((item) => item.tool !== tool), { tool, at: Date.now(), output }].slice(
    -MAX_SNAPSHOTS,
  )
}

export const getLatestSessionToolData = (
  tool?: SessionToolSnapshot["tool"],
): SessionToolSnapshot | null => {
  if (tool) {
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      if (snapshots[index]?.tool === tool) {
        return snapshots[index] ?? null
      }
    }
    return null
  }
  return snapshots[snapshots.length - 1] ?? null
}

export const getSessionToolSnapshots = () => [...snapshots]
