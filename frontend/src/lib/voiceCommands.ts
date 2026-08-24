const foldPhonetics = (value: string): string =>
  value
    .replace(/th/g, "s")
    .replace(/z/g, "s")
    .replace(/j/g, "i")
    .replace(/y/g, "i")
    .replace(/ck/g, "k")
    .replace(/qu/g, "k")
    .replace(/c/g, "k")

export const normalizeTranscript = (value: string): string =>
  foldPhonetics(
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )

const levenshtein = (left: string, right: string): number => {
  if (left === right) {
    return 0
  }
  const rows = left.length + 1
  const cols = right.length + 1
  const matrix: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))
  for (let i = 0; i < rows; i += 1) {
    matrix[i]![0] = i
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0]![j] = j
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      matrix[i]![j] = Math.min(
        (matrix[i - 1]![j] ?? 0) + 1,
        (matrix[i]![j - 1] ?? 0) + 1,
        (matrix[i - 1]![j - 1] ?? 0) + cost,
      )
    }
  }
  return matrix[left.length]![right.length] ?? 99
}

const closeTo = (token: string, candidates: string[]): boolean =>
  candidates.some((candidate) => {
    if (!token || !candidate) {
      return false
    }
    if (token === candidate || token.includes(candidate) || candidate.includes(token)) {
      return true
    }
    const allowance = Math.max(1, Math.floor(candidate.length / 3))
    return levenshtein(token, candidate) <= allowance
  })

const NAME_TOKENS = ["ek", "isi", "isi", "easi", "issi", "iki", "ese", "ese", "ise", "isee", "ice"]
const WAKE_TOKENS = ["hei", "hei", "iei", "ei", "ok", "okei", "oie", "hola", "ea", "hai", "ei", "ie"]
const HANGUP_TOKENS = ["senks", "sanks", "senks", "gracias", "sankiu", "senkiu", "senk"]

const matchesPair = (
  text: string,
  prefixCheck: (token: string) => boolean,
  gluedNeedles: string[],
): boolean => {
  const compact = normalizeTranscript(text)
  if (!compact) {
    return false
  }
  const glued = compact.replace(/\s/g, "")
  if (gluedNeedles.some((needle) => glued.includes(needle))) {
    return true
  }

  const tokens = compact.split(" ").filter(Boolean)
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i] ?? ""
    const next = tokens[i + 1]
    if (prefixCheck(current) && next && closeTo(next, NAME_TOKENS)) {
      return true
    }
  }
  return false
}

export const isWakeCommand = (transcript: string): boolean =>
  matchesPair(transcript, (token) => closeTo(token, WAKE_TOKENS), [
    "heiisi",
    "heiek",
    "heieasi",
    "ieiisi",
    "heiese",
    "heiese",
    "ieiisi",
    "holaek",
    "holaisi",
    "eisi",
    "eiisi",
  ])

export const isHangupCommand = (transcript: string): boolean =>
  matchesPair(transcript, (token) => closeTo(token, HANGUP_TOKENS), [
    "senksisi",
    "senksek",
    "sanksisi",
    "graciasisi",
    "senksisi",
    "senksese",
  ])
