import type { RealtimeTool } from "../types.js"

export const ATLAS_TOOLS: RealtimeTool[] = [
  {
    type: "function",
    name: "query_prestamo",
    description:
      "Consulta Atlas (caja, cuotas, créditos, clientes, ingresos, egresos, mora, cobros). Devuelve JSON del período. Cada pregunta o follow-up de detalle requiere una llamada nueva; responde solo con esta consulta.",
    parameters: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          enum: [
            "caja-chica",
            "caja-chica-detalle",
            "ingresos",
            "egresos",
            "desembolsos",
            "resumen",
            "cuotas",
            "cuotas-vencidas",
            "creditos",
            "clientes",
            "pagos",
            "liquidez",
          ],
          description:
            "Qué datos consultar. pagos = cobros de cuotas/abonos con cliente. ingresos/egresos = movimientos de caja (motivo, sin cliente). cuotas-vencidas = mora con nombre de cliente.",
        },
        params: {
          type: "object",
          description:
            "Filtros de período y búsqueda. Usa periodo para expresiones relativas del usuario; la app las convierte a fechas.",
          properties: {
            periodo: {
              type: "string",
              description:
                "Período relativo tal como lo dijo el usuario: hoy/today, ayer/yesterday, esta semana/this week, semana pasada/last week, este mes/this month, mes pasado/last month, este año/this year, año pasado/last year. Preferir esto frente a calcular fechas manualmente.",
            },
            fecha: {
              type: "string",
              description: "Un solo día YYYY-MM-DD, o expresión relativa de un día (hoy/today, ayer/yesterday).",
            },
            fechaInicio: {
              type: "string",
              description: "Inicio del rango YYYY-MM-DD. Siempre junto con fechaFin si no usas periodo.",
            },
            fechaFin: {
              type: "string",
              description: "Fin del rango YYYY-MM-DD. Siempre junto con fechaInicio si no usas periodo.",
            },
            year: {
              type: "integer",
              description: "Año completo para caja-chica o caja-chica-detalle.",
            },
            estado: {
              type: "string",
              description: "pendiente, vencido, pagado o revision (cuotas).",
            },
            q: { type: "string", description: "Búsqueda por nombre de cliente." },
            id: { type: "integer", description: "Id de registro concreto." },
            creditoId: { type: "integer" },
            clienteId: { type: "integer" },
            limit: { type: "integer", description: "Máximo de filas (default del servidor ~50)." },
          },
        },
      },
      required: ["resource"],
    },
  },
]
