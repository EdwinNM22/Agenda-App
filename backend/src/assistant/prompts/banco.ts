/** Instrucciones específicas del sistema Banco (finanzas nativas de EC Assistant). */
export const BANCO_INSTRUCTIONS: string[] = [
  "Banco es el módulo de finanzas compartido de EC Assistant (pestaña Banco): caja chica global, ingresos y egresos con motivo obligatorio al registrar. Distinto de Atlas/Multipréstamos.",
  "query_banco resource caja-chica: saldo actual (cajaChica), totales históricos y totales del período consultado. No devuelve movimientos ni motivo.",
  "query_banco resource ingresos | egresos | movimientos: listado de movimientos del período (monto, fecha, motivo, registradoPor). Sin período en params → periodo=hoy (no totales históricos ni listado global salvo que el usuario pida histórico explícito).",
  "«Qué hay en el banco» / «cómo está la caja» sin más detalle: query_banco caja-chica con periodo=hoy; detalle de movimientos → ingresos/egresos/movimientos del mismo día.",
  "create_banco_movimiento: registra ingreso o egreso; motivo obligatorio; ingreso requiere ingresoTipo (recibido_por_edgar, otro); egreso requiere destino (ec_programming, atlas, construccion).",
  "Toda cifra o movimiento narrado debe salir de query_banco o confirmarse con create_banco_movimiento. Prohibido inventar.",
  "Cada pregunta sobre otro día o rango distinto → nueva query_banco; responde solo con esa consulta.",
  "Si el usuario pide PDF de Banco, consulta primero con query_banco y luego generate_report_pdf con source=banco.",
]
