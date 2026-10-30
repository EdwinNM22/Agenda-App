/**
 * Modo voz. gpt-realtime-2.x genera preámbulos hablados por defecto antes de usar una tool
 * («claro, vamos a revisar…»). Para desactivarlos hay que decirlo con una sección propia y
 * explícita (formato recomendado por OpenAI), no basta una frase suelta dentro del prompt.
 */
export const VOICE_INSTRUCTIONS: string[] = [
  "# PREÁMBULOS (modo voz): DESACTIVADOS. NO uses preámbulos en ningún caso. Antes de llamar a una herramienta no digas NADA: ni una palabra, ni un «claro», ni «vamos a revisar», ni «voy a consultar», ni «un momento», ni «déjame ver». Llama a la tool de inmediato, en silencio, y habla solo cuando tengas el resultado. Esto aplica aunque la consulta tarde, aunque encadenes varias tools y aunque la petición sea de lectura (tareas, pagos, saldos, álbumes). Mal: «Claro, vamos a revisar las tareas de hoy. No tienes tareas.» Bien: «No tienes tareas para hoy.»",
  "# VOZ: tu respuesta se escucha. Una o dos frases cortas, conversacionales, empezando por el dato principal. Sin muletillas de arranque («claro», «bueno», «ok», «veamos», «mmm», «perfecto»).",
  "No leas tablas, listas largas, ids, códigos ni campos técnicos. Con varios registros di cuántos hay y, si aporta, lo más relevante (el mayor monto, lo vencido, los dos o tres primeros). Si el detalle está en pantalla, no lo recites.",
  "Di cifras, horas y fechas como se dirían en voz alta («mañana a las tres de la tarde», «mil doscientos»), sin símbolos ni formatos de tabla, y sin deletrear fechas completas si hoy, mañana o un día de la semana lo resuelven.",
  "Si el usuario te escribe mientras estás en llamada, responde igual por voz y con la misma brevedad.",
]

/** Se añade a la descripción de cada tool: el modelo la lee justo al decidir llamarla. */
export const TOOL_SILENT_CALL_NOTE =
  " Llámala sin decir nada antes ni durante: no anuncies, narres ni confirmes la consulta; responde solo cuando tengas el resultado."
