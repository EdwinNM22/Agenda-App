import { api } from "@/lib/api"

export type BancoTipo = "ingreso" | "egreso"

export const BANCO_DESTINOS = ["ec_construction", "multiprestamos_atlas"] as const

export type BancoDestino = (typeof BANCO_DESTINOS)[number]

export const BANCO_DESTINO_LABELS: Record<BancoDestino, string> = {
  ec_construction: "EC Construction",
  multiprestamos_atlas: "Multipréstamos Atlas",
}

export type BancoMovimiento = {
  id: number
  userId: number
  registradoPor: string
  tipo: BancoTipo
  monto: number
  motivo: string
  destino: BancoDestino | null
  destinoLabel: string | null
  fecha: string
  createdAt: string
}

export type BancoResumen = {
  cajaChica: number
  totalIngresos: number
  totalEgresos: number
  periodo: {
    from: string
    to: string
    ingresos: number
    egresos: number
  }
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount)

export const formatBancoDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

export const todayIsoDate = () => {
  const date = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const toBancoDatetimeLocalValue = (fecha: string): string => {
  const date = fecha.trim().slice(0, 10)
  if (!ISO_DATE.test(date)) {
    return ""
  }
  return `${date}T12:00`
}

export const fromBancoDatetimeLocalValue = (value: string): string => {
  const date = value.trim().slice(0, 10)
  return ISO_DATE.test(date) ? date : todayIsoDate()
}

export const defaultBancoDatetimeLocalValue = () => toBancoDatetimeLocalValue(todayIsoDate())

export const normalizeBancoResumen = (value: Partial<BancoResumen> | null | undefined): BancoResumen => ({
  cajaChica: Number(value?.cajaChica ?? 0),
  totalIngresos: Number(value?.totalIngresos ?? 0),
  totalEgresos: Number(value?.totalEgresos ?? 0),
  periodo: {
    from: value?.periodo?.from ?? "",
    to: value?.periodo?.to ?? "",
    ingresos: Number(value?.periodo?.ingresos ?? 0),
    egresos: Number(value?.periodo?.egresos ?? 0),
  },
})

export const fetchBancoResumen = async () =>
  normalizeBancoResumen(await api<BancoResumen>("/banco/resumen"))

export const fetchBancoMovimientos = (tipo?: BancoTipo) => {
  const query = tipo ? `?tipo=${tipo}` : ""
  return api<{ movimientos: BancoMovimiento[] }>(`/banco/movimientos${query}`)
}

export const createBancoIngreso = (body: { monto: number; motivo: string; fecha: string }) =>
  api<{ movimiento: BancoMovimiento }>("/banco/ingresos", {
    method: "POST",
    body: JSON.stringify(body),
  })

export const createBancoEgreso = (body: {
  monto: number
  motivo: string
  destino: BancoDestino
  fecha: string
}) =>
  api<{ movimiento: BancoMovimiento }>("/banco/egresos", {
    method: "POST",
    body: JSON.stringify(body),
  })

export const updateBancoMovimiento = (
  id: number,
  body: { monto?: number; motivo?: string; destino?: BancoDestino; fecha?: string },
) =>
  api<{ movimiento: BancoMovimiento | null }>(`/banco/movimientos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })

export const deleteBancoMovimiento = (id: number) =>
  api<{ ok: boolean }>(`/banco/movimientos/${id}`, { method: "DELETE" })
