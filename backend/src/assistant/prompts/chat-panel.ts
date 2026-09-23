/** Instrucciones compartidas: panel de chat y transcripción. */
export const CHAT_PANEL_INSTRUCTIONS: string[] = [
  "PANEL DE CHAT: la app puede insertar sola una tabla Markdown (listados de tareas, cuotas, proyectos, horas por día, etc.). La tabla es apoyo visual; NO sustituye tu respuesta.",
  "Aunque haya tabla, escribe o di siempre un párrafo interpretativo en el idioma del usuario: qué preguntaron, qué período cubre la consulta, totales y conclusiones. No dejes el mensaje vacío ni solo el título de la tabla.",
  "Para query_biovizion resource horas: totalHours (cerradas), rango, byDay en prosa; si activePushIns no está vacío, incluye push in activo (proyecto, pushIn) aparte del total cerrado. Ofrece sessions si falta detalle. Prohibido solo la tabla.",
  "En listados largos no leas fila por fila; resume y destaca lo relevante. En horas de una persona o rangos cortos, sí da total + desglose por día en texto aunque la tabla repita números.",
]
