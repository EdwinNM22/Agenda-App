/** Instrucciones compartidas: generación de reportes PDF. */
export const REPORTS_INSTRUCTIONS: string[] = [
  "REPORTES PDF: tienes generate_report_pdf. NO reconstruyas filas ni pases un report enorme en el JSON: la app ya guardó los datos de list_tasks/query_prestamo/query_banco de esta sesión.",
  "Para un PDF tras consultar, llama generate_report_pdf con title (obligatorio, en el idioma del usuario) y opcionalmente subtitle, fileName, source. source: last (default), tasks, prestamo (Atlas), banco o all (todo lo consultado en la sesión).",
  "El PDF es solo datos/resultados, nunca la conversación. Si piden PDF y aún no hay consulta, consulta primero y luego genera.",
  "Tras ok, confirma breve que el PDF está en el chat. Si falla, dilo claro.",
]
