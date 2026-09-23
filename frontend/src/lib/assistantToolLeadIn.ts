/** Texto de relleno antes de una tool; no mostrarlo al usuario. */
export const isToolLeadInText = (text: string): boolean => {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }
  if (trimmed.length > 320) {
    return false
  }

  const t = trimmed.toLowerCase()
  const patterns = [
    /^voy a consult/,
    /^voy a revis/,
    /^voy a mir/,
    /^voy a busc/,
    /^d[eé]jame consult/,
    /^d[eé]jame revis/,
    /^perm[ií]teme/,
    /^un momento/,
    /^ahora consult/,
    /^ahora revis/,
    /consultar .+ y te cuento/,
    /te cuento enseguida/,
    /^let me (?:check|look|query|get)/,
    /^i(?:'ll| will) (?:check|look|query|get)/,
    /^give me a (?:moment|second)/,
  ]

  return patterns.some((pattern) => pattern.test(t))
}

export const responseIncludesFunctionCall = (
  response: Record<string, unknown> | undefined,
): boolean => {
  const output = response?.output
  if (!Array.isArray(output)) {
    return false
  }
  return output.some((item) => {
    if (!item || typeof item !== "object") {
      return false
    }
    return (item as { type?: string }).type === "function_call"
  })
}
