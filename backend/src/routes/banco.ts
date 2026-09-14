import type { FastifyInstance } from "fastify"
import type { ResultSetHeader, RowDataPacket } from "mysql2"
import {
  parseBancoFecha,
  parseBancoMonto,
  parseBancoTipo,
  pool,
  toPublicBancoMovimiento,
  type BancoMovimientoRow,
  type BancoTipo,
} from "../db.js"
import { formatDateOnly } from "../naiveDateTime.js"

type MovimientoBody = {
  tipo?: string
  monto?: number
  motivo?: string
  fecha?: string
}

type MovimientoParams = {
  id: string
}

type BancoMovimientoWithUser = BancoMovimientoRow & { user_name: string | null }

const MOVIMIENTO_SELECT = `
  m.id, m.user_id, m.tipo, m.monto, m.motivo, m.fecha, m.created_at, u.name AS user_name
`

const parseMovimientoId = (raw: string): number | null => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    return null
  }
  return id
}

const monthRange = (reference = new Date()) => {
  const from = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-01`
  const lastDay = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate()
  const to = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return { from, to }
}

const parseOptionalDate = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") {
    return null
  }
  return parseBancoFecha(value)
}

const findMovimiento = async (id: number) => {
  const [rows] = await pool.query<BancoMovimientoWithUser[]>(
    `SELECT ${MOVIMIENTO_SELECT}
     FROM banco_movimientos m
     INNER JOIN users u ON u.id = m.user_id
     WHERE m.id = :id
     LIMIT 1`,
    { id },
  )
  return rows[0] ?? null
}

const getBalance = async () => {
  const [rows] = await pool.query<
    (RowDataPacket & { ingresos: string | null; egresos: string | null })[]
  >(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto END), 0) AS ingresos,
       COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto END), 0) AS egresos
     FROM banco_movimientos`,
  )
  const ingresos = Number(rows[0]?.ingresos ?? 0)
  const egresos = Number(rows[0]?.egresos ?? 0)
  return {
    ingresos,
    egresos,
    cajaChica: Math.round((ingresos - egresos) * 100) / 100,
  }
}

const getPeriodTotals = async (from: string, to: string) => {
  const [rows] = await pool.query<
    (RowDataPacket & { ingresos: string | null; egresos: string | null })[]
  >(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto END), 0) AS ingresos,
       COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto END), 0) AS egresos
     FROM banco_movimientos
     WHERE fecha BETWEEN :from AND :to`,
    { from, to },
  )
  return {
    ingresos: Number(rows[0]?.ingresos ?? 0),
    egresos: Number(rows[0]?.egresos ?? 0),
  }
}

const validateMovimientoBody = (body: MovimientoBody, tipoOverride?: BancoTipo) => {
  const tipo = tipoOverride ?? parseBancoTipo(body.tipo)
  const monto = parseBancoMonto(body.monto)
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : ""
  const fecha = parseBancoFecha(body.fecha) ?? formatDateOnly(new Date())

  if (!tipo) {
    return { error: "Tipo inválido. Usa ingreso o egreso." as const }
  }
  if (monto === null) {
    return { error: "El monto debe ser mayor a cero." as const }
  }
  if (!motivo) {
    return { error: "El motivo es obligatorio." as const }
  }
  if (motivo.length > 500) {
    return { error: "El motivo no puede superar 500 caracteres." as const }
  }

  return { tipo, monto, motivo, fecha }
}

export const registerBancoRoutes = async (app: FastifyInstance) => {
  app.get(
    "/banco/resumen",
    { onRequest: [app.authenticate] },
    async (request) => {
      const query = request.query as { from?: string; to?: string }
      const period = monthRange()
      const from = parseOptionalDate(query.from) ?? period.from
      const to = parseOptionalDate(query.to) ?? period.to
      const balance = await getBalance()
      const periodTotals = await getPeriodTotals(from, to)

      return {
        cajaChica: balance.cajaChica,
        totalIngresos: balance.ingresos,
        totalEgresos: balance.egresos,
        periodo: {
          from,
          to,
          ingresos: periodTotals.ingresos,
          egresos: periodTotals.egresos,
        },
      }
    },
  )

  app.get(
    "/banco/movimientos",
    { onRequest: [app.authenticate] },
    async (request) => {
      const query = request.query as {
        tipo?: string
        from?: string
        to?: string
        limit?: string
      }
      const tipo = query.tipo ? parseBancoTipo(query.tipo) : null
      if (query.tipo && !tipo) {
        return { movimientos: [] }
      }

      const from = parseOptionalDate(query.from)
      const to = parseOptionalDate(query.to)
      const limitRaw = Number(query.limit ?? 100)
      const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100

      const conditions: string[] = []
      const params: Record<string, string | number> = { limit }

      if (tipo) {
        conditions.push("m.tipo = :tipo")
        params.tipo = tipo
      }
      if (from) {
        conditions.push("m.fecha >= :from")
        params.from = from
      }
      if (to) {
        conditions.push("m.fecha <= :to")
        params.to = to
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

      const [rows] = await pool.query<BancoMovimientoWithUser[]>(
        `SELECT ${MOVIMIENTO_SELECT}
         FROM banco_movimientos m
         INNER JOIN users u ON u.id = m.user_id
         ${where}
         ORDER BY m.fecha DESC, m.id DESC
         LIMIT :limit`,
        params,
      )

      return { movimientos: rows.map(toPublicBancoMovimiento) }
    },
  )

  app.post(
    "/banco/movimientos",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = validateMovimientoBody(request.body as MovimientoBody)
      if ("error" in parsed) {
        return reply.code(400).send({ message: parsed.error })
      }

      if (parsed.tipo === "egreso") {
        const balance = await getBalance()
        if (parsed.monto > balance.cajaChica) {
          return reply.code(400).send({
            message: "No hay suficiente saldo en caja chica para este egreso.",
          })
        }
      }

      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO banco_movimientos (user_id, tipo, monto, motivo, fecha)
         VALUES (:userId, :tipo, :monto, :motivo, :fecha)`,
        {
          userId: request.user.sub,
          tipo: parsed.tipo,
          monto: parsed.monto,
          motivo: parsed.motivo,
          fecha: parsed.fecha,
        },
      )

      const movimiento = await findMovimiento(result.insertId)
      if (!movimiento) {
        return reply.code(500).send({ message: "No se pudo registrar el movimiento." })
      }

      return { movimiento: toPublicBancoMovimiento(movimiento) }
    },
  )

  app.post(
    "/banco/ingresos",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = validateMovimientoBody(request.body as MovimientoBody, "ingreso")
      if ("error" in parsed) {
        return reply.code(400).send({ message: parsed.error })
      }

      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO banco_movimientos (user_id, tipo, monto, motivo, fecha)
         VALUES (:userId, 'ingreso', :monto, :motivo, :fecha)`,
        {
          userId: request.user.sub,
          monto: parsed.monto,
          motivo: parsed.motivo,
          fecha: parsed.fecha,
        },
      )

      const movimiento = await findMovimiento(result.insertId)
      if (!movimiento) {
        return reply.code(500).send({ message: "No se pudo registrar el ingreso." })
      }

      return { movimiento: toPublicBancoMovimiento(movimiento) }
    },
  )

  app.post(
    "/banco/egresos",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const parsed = validateMovimientoBody(request.body as MovimientoBody, "egreso")
      if ("error" in parsed) {
        return reply.code(400).send({ message: parsed.error })
      }

      const balance = await getBalance()
      if (parsed.monto > balance.cajaChica) {
        return reply.code(400).send({
          message: "No hay suficiente saldo en caja chica para este egreso.",
        })
      }

      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO banco_movimientos (user_id, tipo, monto, motivo, fecha)
         VALUES (:userId, 'egreso', :monto, :motivo, :fecha)`,
        {
          userId: request.user.sub,
          monto: parsed.monto,
          motivo: parsed.motivo,
          fecha: parsed.fecha,
        },
      )

      const movimiento = await findMovimiento(result.insertId)
      if (!movimiento) {
        return reply.code(500).send({ message: "No se pudo registrar el egreso." })
      }

      return { movimiento: toPublicBancoMovimiento(movimiento) }
    },
  )

  app.patch(
    "/banco/movimientos/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const id = parseMovimientoId((request.params as MovimientoParams).id)
      if (!id) {
        return reply.code(400).send({ message: "Movimiento inválido." })
      }

      const existing = await findMovimiento(id)
      if (!existing) {
        return reply.code(404).send({ message: "Movimiento no encontrado." })
      }

      const body = request.body as MovimientoBody
      const monto = body.monto !== undefined ? parseBancoMonto(body.monto) : Number(existing.monto)
      const motivo =
        body.motivo !== undefined
          ? typeof body.motivo === "string"
            ? body.motivo.trim()
            : ""
          : existing.motivo
      const fecha =
        body.fecha !== undefined ? parseBancoFecha(body.fecha) : parseBancoFecha(existing.fecha)

      if (monto === null) {
        return reply.code(400).send({ message: "El monto debe ser mayor a cero." })
      }
      if (!motivo) {
        return reply.code(400).send({ message: "El motivo es obligatorio." })
      }
      if (motivo.length > 500) {
        return reply.code(400).send({ message: "El motivo no puede superar 500 caracteres." })
      }
      if (!fecha) {
        return reply.code(400).send({ message: "Fecha inválida." })
      }

      const balance = await getBalance()
      const delta =
        existing.tipo === "ingreso" ? -Number(existing.monto) : Number(existing.monto)
      const projected = balance.cajaChica + delta + (existing.tipo === "ingreso" ? monto : -monto)
      if (projected < 0) {
        return reply.code(400).send({
          message: "Este cambio dejaría la caja chica en negativo.",
        })
      }

      await pool.query(
        `UPDATE banco_movimientos
         SET monto = :monto, motivo = :motivo, fecha = :fecha
         WHERE id = :id`,
        { id, monto, motivo, fecha },
      )

      const movimiento = await findMovimiento(id)
      return { movimiento: movimiento ? toPublicBancoMovimiento(movimiento) : null }
    },
  )

  app.delete(
    "/banco/movimientos/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const id = parseMovimientoId((request.params as MovimientoParams).id)
      if (!id) {
        return reply.code(400).send({ message: "Movimiento inválido." })
      }

      const existing = await findMovimiento(id)
      if (!existing) {
        return reply.code(404).send({ message: "Movimiento no encontrado." })
      }

      if (existing.tipo === "ingreso") {
        const balance = await getBalance()
        if (Number(existing.monto) > balance.cajaChica) {
          return reply.code(400).send({
            message: "No se puede eliminar este ingreso porque el saldo ya fue utilizado.",
          })
        }
      }

      await pool.query("DELETE FROM banco_movimientos WHERE id = :id", { id })

      return { ok: true }
    },
  )
}
