export type PrestamoPeriodRange = {
  fechaInicio: string
  fechaFin: string
  fecha?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const pad = (value: number) => String(value).padStart(2, "0")

export const formatYmd = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const startOfDay = (date: Date): Date => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return startOfDay(next)
}

const today = (): Date => startOfDay(new Date())

const mondayOfWeek = (date: Date): Date => {
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  return addDays(date, offset)
}

const endOfMonth = (year: number, monthIndex: number): Date =>
  startOfDay(new Date(year, monthIndex + 1, 0))

const singleDay = (date: Date): PrestamoPeriodRange => {
  const value = formatYmd(date)
  return { fecha: value, fechaInicio: value, fechaFin: value }
}

const range = (start: Date, end: Date): PrestamoPeriodRange => ({
  fechaInicio: formatYmd(start),
  fechaFin: formatYmd(end),
})

const PERIOD_RESOLVERS: Record<string, (anchor: Date) => PrestamoPeriodRange> = {
  hoy: (anchor) => singleDay(anchor),
  ayer: (anchor) => singleDay(addDays(anchor, -1)),
  manana: (anchor) => singleDay(addDays(anchor, 1)),
  esta_semana: (anchor) => range(mondayOfWeek(anchor), anchor),
  semana_pasada: (anchor) => {
    const thisMonday = mondayOfWeek(anchor)
    const lastSunday = addDays(thisMonday, -1)
    const lastMonday = addDays(thisMonday, -7)
    return range(lastMonday, lastSunday)
  },
  este_mes: (anchor) => range(new Date(anchor.getFullYear(), anchor.getMonth(), 1), anchor),
  mes_pasado: (anchor) => {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)
    const end = endOfMonth(start.getFullYear(), start.getMonth())
    return range(start, end)
  },
  este_ano: (anchor) => range(new Date(anchor.getFullYear(), 0, 1), anchor),
  ano_pasado: (anchor) => {
    const year = anchor.getFullYear() - 1
    return range(new Date(year, 0, 1), new Date(year, 11, 31))
  },
}

const foldAccents = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

const normalizePhrase = (value: string): string => {
  let phrase = foldAccents(value).trim().replace(/[¿?¡!.,]/g, "")
  phrase = phrase.replace(/^(los|las)\s+de\s+/, "")
  phrase = phrase.replace(/^(el|la)\s+/, "")
  return phrase.replace(/\s+/g, "_")
}

const PHRASE_TO_PERIOD: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /^hoy$/, key: "hoy" },
  { pattern: /^ayer$/, key: "ayer" },
  { pattern: /^(manana|mañana)$/, key: "manana" },
  { pattern: /^esta_semana$/, key: "esta_semana" },
  { pattern: /^semana_pasada$/, key: "semana_pasada" },
  { pattern: /^este_mes$/, key: "este_mes" },
  { pattern: /^mes_pasado$/, key: "mes_pasado" },
  { pattern: /^(este|el)_ano$/, key: "este_ano" },
  { pattern: /^ano_pasado$/, key: "ano_pasado" },
]

export const resolvePrestamoPeriodPhrase = (
  phrase: string,
  anchor = today(),
): PrestamoPeriodRange | null => {
  const normalized = normalizePhrase(phrase)
  for (const { pattern, key } of PHRASE_TO_PERIOD) {
    if (pattern.test(normalized)) {
      return PERIOD_RESOLVERS[key](anchor)
    }
  }
  return null
}

const resolveDateToken = (value: string, anchor: Date): string => {
  const trimmed = value.trim()
  if (ISO_DATE.test(trimmed)) {
    return trimmed
  }

  const resolved = resolvePrestamoPeriodPhrase(trimmed, anchor)
  if (resolved?.fecha) {
    return resolved.fecha
  }

  return trimmed
}

const applyRange = (
  out: Record<string, unknown>,
  resolved: PrestamoPeriodRange,
): Record<string, unknown> => {
  if (resolved.fecha) {
    out.fecha = resolved.fecha
    delete out.fechaInicio
    delete out.fechaFin
    return out
  }

  out.fechaInicio = resolved.fechaInicio
  out.fechaFin = resolved.fechaFin
  delete out.fecha
  return out
}

export const normalizePrestamoParams = (
  params: Record<string, unknown> | undefined,
  anchor = today(),
): Record<string, unknown> | undefined => {
  if (!params) {
    return params
  }

  const out: Record<string, unknown> = { ...params }

  if (typeof out.periodo === "string" && out.periodo.trim()) {
    const resolved = resolvePrestamoPeriodPhrase(out.periodo, anchor)
    if (resolved) {
      delete out.periodo
      return normalizePrestamoParams(applyRange(out, resolved), anchor)
    }
  }

  if (typeof out.fecha === "string" && !ISO_DATE.test(out.fecha.trim())) {
    const resolved = resolvePrestamoPeriodPhrase(out.fecha, anchor)
    if (resolved) {
      return normalizePrestamoParams(applyRange(out, resolved), anchor)
    }
  }

  if (
    typeof out.fechaInicio === "string" &&
    typeof out.fechaFin === "string" &&
    !ISO_DATE.test(out.fechaInicio.trim()) &&
    !ISO_DATE.test(out.fechaFin.trim()) &&
    normalizePhrase(out.fechaInicio) === normalizePhrase(out.fechaFin)
  ) {
    const resolved = resolvePrestamoPeriodPhrase(out.fechaInicio, anchor)
    if (resolved) {
      return normalizePrestamoParams(applyRange(out, resolved), anchor)
    }
  }

  for (const key of ["fecha", "fechaInicio", "fechaFin"] as const) {
    const value = out[key]
    if (typeof value === "string") {
      out[key] = resolveDateToken(value, anchor)
    }
  }

  if (typeof out.fecha === "string" && ISO_DATE.test(out.fecha)) {
    delete out.fechaInicio
    delete out.fechaFin
  }

  delete out.periodo
  return out
}
