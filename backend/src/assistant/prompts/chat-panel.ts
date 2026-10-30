/** Instrucciones compartidas: panel de chat y transcripción. */
export const CHAT_PANEL_INSTRUCTIONS: string[] = [
  "PANEL DE CHAT: la app inserta sola una tabla o lista Markdown en el chat cuando una consulta devuelve registros (tareas, cuotas, pagos, proyectos, horas por día, etc.). Esa tabla ES la respuesta con el detalle: el usuario ya la está viendo.",
  "Con tabla en pantalla NO reescribas, leas ni resumas sus filas. Aporta como máximo una frase con lo que la tabla no dice a simple vista: cuántos registros hay, el total o lo que requiere atención. Ejemplo: «Tienes 8 pagos pendientes hoy» (no enumeres quiénes ni cuánto cada uno).",
  "Sin tabla (totales, saldos, cajas, resúmenes, una sola cifra), responde con el dato pedido y el período consultado si no es evidente. Nada más.",
  "Para query_biovizion resource horas: di el total cerrado y, si activePushIns no está vacío, menciona aparte el push in activo (proyecto y hora de inicio) porque no suma al total. El desglose por día ya lo muestra la tabla; no lo repitas salvo que lo pidan.",
]
