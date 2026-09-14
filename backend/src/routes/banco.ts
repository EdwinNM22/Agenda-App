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

const MOVIMIENTO_COLUMNS = "id, user_id, tipo, monto, motivo, fecha, created_at"

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

const findOwnMovimiento = async (id: number, userId: number) => {
  const [rows] = await pool.query<BancoMovimientoRow[]>(
    `SELECT ${MOVIMIENTO_COLUMNS} FROM banco_movimientos WHERE id = :id AND user_id = :userId LIMIT 1`,
    { id, userId },
  )
  return rows[0] ?? null
}

const getBalance = async (userId: number) => {
  const [rows] = await pool.query<
    (RowDataPacket & { ingresos: string | null; egresos: string | null })[]
  >(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto END), 0) AS ingresos,
       COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto END), 0) AS egresos
     FROM banco_movimientos
     WHERE user_id = :userId`,
    { userId },
  )
  const ingresos = Number(rows[0]?.ingresos ?? 0)
  const egresos = Number(rows[0]?.egresos ?? 0)
  return {
    ingresos,
    egresos,
    cajaChica: Math.round((ingresos - egresos) * 100) / 100,
  }
}

const getPeriodTotals = async (userId: number, from: string, to: string) => {
  const [rows] = await pool.query<
    (RowDataPacket & { ingresos: string | null; egresos: string | null })[]
  >(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto END), 0) AS ingresos,
       COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto END), 0) AS egresos
     FROM banco_movimientos
     WHERE user_id = :userId AND fecha BETWEEN :from AND :to`,
    { userId, from, to },
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
      const balance = await getBalance(request.user.sub)
      const periodTotals = await getPeriodTotals(request.user.sub, from, to)

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

      const conditions = ["user_id = :userId"]
      const params: Record<string, string | number> = { userId: request.user.sub, limit }

      if (tipo) {
        conditions.push("tipo = :tipo")
        params.tipo = tipo
      }
      if (from) {
        conditions.push("fecha >= :from")
        params.from = from
      }
      if (to) {
        conditions.push("fecha <= :to")
        params.to = to
      }

      const [rows] = await pool.query<BancoMovimientoRow[]>(
        `SELECT ${MOVIMIENTO_COLUMNS}
         FROM banco_movimientos
         WHERE ${conditions.join(" AND ")}
         ORDER BY fecha DESC, id DESC
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
        const balance = await getBalance(request.user.sub)
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

      const movimiento = await findOwnMovimiento(result.insertId, request.user.sub)
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

      const movimiento = await findOwnMovimiento(result.insertId, request.user.sub)
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

      const balance = await getBalance(request.user.sub)
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

      const movimiento = await findOwnMovimiento(result.insertId, request.user.sub)
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

      const existing = await findOwnMovimiento(id, request.user.sub)
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

      const balance = await getBalance(request.user.sub)
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
         WHERE id = :id AND user_id = :userId`,
        { id, userId: request.user.sub, monto, motivo, fecha },
      )

      const movimiento = await findOwnMovimiento(id, request.user.sub)
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

      const existing = await findOwnMovimiento(id, request.user.sub)
      if (!existing) {
        return reply.code(404).send({ message: "Movimiento no encontrado." })
      }

      if (existing.tipo === "ingreso") {
        const balance = await getBalance(request.user.sub)
        if (Number(existing.monto) > balance.cajaChica) {
          return reply.code(400).send({
            message: "No se puede eliminar este ingreso porque el saldo ya fue utilizado.",
          })
        }
      }

      await pool.query("DELETE FROM banco_movimientos WHERE id = :id AND user_id = :userId", {
        id,
        userId: request.user.sub,
      })

      return { ok: true }
    },
  )
}
