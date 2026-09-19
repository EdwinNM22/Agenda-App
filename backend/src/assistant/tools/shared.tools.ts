import type { RealtimeTool } from "../types.js"

export const SHARED_TOOLS: RealtimeTool[] = [
  {
    type: "function",
    name: "generate_report_pdf",
    description:
      "Genera un PDF con los datos ya obtenidos en esta sesión (list_tasks, query_prestamo o query_banco). No reenvíes las filas: la app las toma del caché. Úsala cuando el usuario pida un PDF/reporte. Devuelve url y fileName.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Título del reporte en el idioma del usuario. Ejemplo: Cuotas de hoy / Today's installments.",
        },
        subtitle: {
          type: "string",
          description: "Subtítulo opcional.",
        },
        fileName: {
          type: "string",
          description: "Nombre de archivo opcional, con o sin .pdf.",
        },
        source: {
          type: "string",
          enum: ["last", "tasks", "prestamo", "banco", "all"],
          description:
            "De dónde sacar los datos: last (última consulta, default), tasks, prestamo (Atlas), banco o all (consolidado de la sesión).",
        },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "end_call",
    description:
      "Cuelga la llamada. Úsala cuando el usuario diga thanks EC, zenks isi, thank you EC o gracias EC.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
]
