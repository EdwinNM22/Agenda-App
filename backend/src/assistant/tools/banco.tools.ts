import type { RealtimeTool } from "../types.js"

export const BANCO_TOOLS: RealtimeTool[] = [
  {
    type: "function",
    name: "query_banco",
    description:
      "Consulta Banco (caja chica de EC Assistant). caja-chica = totales y saldo. ingresos/egresos/movimientos = filas con monto, fecha, motivo, registradoPor (egresos: destinoLabel). Cada pregunta = una llamada nueva.",
    parameters: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          enum: ["caja-chica", "ingresos", "egresos", "movimientos"],
          description:
            "caja-chica: saldo y totales agregados (sin motivo). ingresos/egresos: movimientos de ese tipo con motivo. movimientos: ingresos y egresos juntos.",
        },
        params: {
          type: "object",
          description:
            "Filtros opcionales de período (periodo, fecha, fechaInicio/fechaFin, limit). Omite período para listar movimientos recientes sin acotar a un solo día.",
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
            limit: { type: "integer", description: "Máximo de filas en listados (default 100, máx. 500)." },
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
      "Registra un ingreso o egreso en Banco. El motivo describe qué es el movimiento. Egreso requiere destino.",
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
          description: "Descripción de qué es el movimiento (obligatorio).",
        },
        destino: {
          type: "string",
          enum: ["ec_construction", "multiprestamos_atlas"],
          description:
            "Obligatorio si tipo=egreso. ec_construction = EC Construction; multiprestamos_atlas = Multipréstamos Atlas.",
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
