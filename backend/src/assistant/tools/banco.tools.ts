import type { RealtimeTool } from "../types.js"

export const BANCO_TOOLS: RealtimeTool[] = [
  {
    type: "function",
    name: "query_banco",
    description:
      "Consulta Banco (caja chica, ingresos, egresos de EC Assistant). Devuelve JSON del período. Cada pregunta requiere una llamada nueva; responde solo con esta consulta.",
    parameters: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          enum: ["caja-chica", "ingresos", "egresos", "movimientos"],
          description:
            "caja-chica = saldo y totales. ingresos/egresos = listado de movimientos. movimientos = ingresos y egresos juntos.",
        },
        params: {
          type: "object",
          description:
            "Filtros de período. Usa periodo para expresiones relativas (hoy/today, este mes/this month, etc.); la app las convierte a fechas.",
          properties: {
            periodo: {
              type: "string",
              description:
                "Período relativo: hoy/today, ayer/yesterday, esta semana/this week, semana pasada/last week, este mes/this month, mes pasado/last month, este año/this year, año pasado/last year.",
            },
            fecha: {
              type: "string",
              description: "Un solo día YYYY-MM-DD o expresión relativa (hoy/today, ayer/yesterday).",
            },
            fechaInicio: { type: "string", description: "Inicio del rango YYYY-MM-DD." },
            fechaFin: { type: "string", description: "Fin del rango YYYY-MM-DD." },
            limit: { type: "integer", description: "Máximo de filas en listados (default 100)." },
          },
        },
      },
      required: ["resource"],
    },
  },
  {
    type: "function",
    name: "create_banco_movimiento",
    description:
      "Registra un ingreso o egreso en Banco (caja chica compartida). Egreso requiere destino; por ahora solo crea el movimiento en esta app.",
    parameters: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["ingreso", "egreso"],
          description: "ingreso o egreso.",
        },
        monto: {
          type: "number",
          description: "Monto mayor a cero.",
        },
        motivo: {
          type: "string",
          description: "Motivo o descripción del movimiento.",
        },
        destino: {
          type: "string",
          enum: ["ec_construction", "multiprestamos_atlas"],
          description:
            "Obligatorio si tipo=egreso. ec_construction = EC Construction; multiprestamos_atlas = Multipréstamos Atlas (prestamo-nuevo).",
        },
        fecha: {
          type: "string",
          description: "Fecha YYYY-MM-DD. Omítela para usar hoy.",
        },
      },
      required: ["tipo", "monto", "motivo"],
    },
  },
]
