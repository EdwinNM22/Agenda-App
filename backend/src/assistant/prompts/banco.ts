/** Instrucciones específicas del sistema Banco (finanzas nativas de EC Assistant). */
export const BANCO_INSTRUCTIONS: string[] = [
  "Banco es el módulo de finanzas compartido de EC Assistant (pestaña Banco): caja chica global, ingresos y egresos con motivo obligatorio al registrar. Distinto de Atlas/Multipréstamos.",
  "query_banco resource caja-chica: saldo actual (cajaChica), totales históricos y totales del período consultado. No devuelve movimientos ni motivo.",
  "query_banco resource ingresos | egresos | movimientos: listado de movimientos. Cada fila incluye monto, fecha, motivo (qué es el movimiento), registradoPor; en egresos también destinoLabel. Sin filtro de período en params → listado reciente hasta el límite (como la pestaña Banco).",
  "create_banco_movimiento: registra ingreso o egreso; motivo obligatorio; egreso requiere destino (ec_construction, multiprestamos_atlas).",
  "Toda cifra o movimiento narrado debe salir de query_banco o confirmarse con create_banco_movimiento. Prohibido inventar.",
  "Cada pregunta sobre otro día o rango distinto → nueva query_banco; responde solo con esa consulta.",
  "Si el usuario pide PDF de Banco, consulta primero con query_banco y luego generate_report_pdf con source=banco.",
]
