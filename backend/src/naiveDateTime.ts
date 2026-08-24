const TWELVE_HOUR =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i
const TWENTY_FOUR_HOUR =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/

const pad = (value: number) => String(value).padStart(2, "0")

const formatTwelveHour = (hour24: number, minute: string): string => {
  const period = hour24 >= 12 ? "PM" : "AM"
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${pad(hour12)}:${minute} ${period}`
}

export const toNaiveDateTime = (value?: string | null): string | null => {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  const twelve = trimmed.match(TWELVE_HOUR)
  if (twelve) {
    const [, date, hourRaw, minute, period] = twelve
    const hour = Number(hourRaw)
    if (hour < 1 || hour > 12) {
      return null
    }
    return `${date} ${pad(hour)}:${minute} ${period.toUpperCase()}`
  }
  const twentyFour = trimmed.match(TWENTY_FOUR_HOUR)
  if (!twentyFour) {
    return null
  }
  const [, date, hourRaw, minute] = twentyFour
  const hour = Number(hourRaw)
  if (hour > 23) {
    return null
  }
  return `${date} ${formatTwelveHour(hour, minute)}`
}

export const formatDateOnly = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const nowNaiveDateTime = (): string => {
  const date = new Date()
  return `${formatDateOnly(date)} ${formatTwelveHour(date.getHours(), pad(date.getMinutes()))}`
}

export const todayDate = (): string => formatDateOnly(new Date())

export const tomorrowDate = (): string => {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return formatDateOnly(date)
}
