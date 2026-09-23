import type { RealtimeTool } from "../types.js"

export const BIOVIZION_ALBUMS_TOOLS: RealtimeTool[] = [
  {
    type: "function",
    name: "query_biovizion",
    description:
      "Consulta Biovizion (proyectos, agenda de proyectos, trabajadores, push in/out, horas, equipo por proyecto, citas representantes, DRE, reportes de intervención, ubicaciones de proyectos). Devuelve JSON. Cada pregunta o follow-up requiere una llamada nueva; responde solo con esta consulta.",
    parameters: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          enum: [
            "resumen",
            "proyectos",
            "reportes",
            "citas",
            "dre",
            "asistencia",
            "personas",
            "ubicaciones",
            "horas",
            "equipo",
            "push-pendientes",
            "inconsistencias",
          ],
          description:
            "resumen, proyectos, reportes, citas, dre, asistencia, ubicaciones, equipo, personas, push-pendientes, inconsistencias: consultas Biovizion habituales. horas: rango o día; totalHours solo jornadas cerradas; byDay; sessions; activePushIns (push in abierto, no suma al total). userName filtra trabajador en horas.",
        },
        params: {
          type: "object",
          description:
            "Filtros. Usa periodo para expresiones relativas; la app convierte fechas. horas usa date (un día). equipo usa projectId o search (nombre de proyecto).",
          properties: {
            periodo: {
              type: "string",
              description:
                "hoy/today, ayer/yesterday, esta semana/this week, semana pasada/last week, este mes/this month, mes pasado/last month, etc.",
            },
            fecha: { type: "string", description: "Un día YYYY-MM-DD o expresión relativa (hoy/today, ayer/yesterday)." },
            fechaInicio: { type: "string", description: "Inicio YYYY-MM-DD (con fechaFin si no usas periodo)." },
            fechaFin: { type: "string", description: "Fin YYYY-MM-DD." },
            date: { type: "string", description: "Para resource horas: día YYYY-MM-DD o expresión relativa." },
            status: {
              type: "string",
              description:
                "proyectos: activos, archivados, activo, finalizado, cancelado, archivado. dre: pending, pending_schedule, scheduled, completed, cancelled, etc.",
            },
            search: { type: "string", description: "Búsqueda por nombre (personas, equipo/proyecto)." },
            userName: { type: "string", description: "Filtrar horas por nombre de trabajador." },
            projectId: { type: "integer", description: "Id de proyecto para equipo." },
            activeOnly: { type: "boolean", description: "personas: omitir bloqueados/ocultos (default true)." },
            limit: { type: "integer", description: "Máximo de filas en personas (default ~50)." },
          },
        },
      },
      required: ["resource"],
    },
  },
]
