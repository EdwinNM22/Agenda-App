/** Instrucciones específicas del sistema Banco (finanzas nativas de EC Assistant). */
export const BANCO_INSTRUCTIONS: string[] = [
  "Banco es el módulo de finanzas compartido de EC Assistant (pestaña Banco): una sola caja chica para toda la app; ingresos y egresos son globales. Cada movimiento guarda quién lo registró (user_id), pero el saldo no es por usuario. Distinto de Atlas/Multipréstamos.",
  "Si el usuario dice Banco, mi banco, caja chica de la app, mis ingresos, mis egresos, cuánto hay en caja (sin mencionar préstamos/cobros/clientes) o finanzas de EC Assistant, usa query_banco o create_banco_movimiento.",
  "Recursos query_banco: caja-chica (saldo y totales del período), ingresos, egresos, movimientos (ambos tipos). Params igual que Atlas: periodo (hoy/today, ayer/yesterday, esta semana/this week, etc.), fecha, fechaInicio/fechaFin, limit.",
  "Para registrar en Banco usa create_banco_movimiento: ingreso → tipo, monto, motivo; egreso → además destino obligatorio (ec_construction = EC Construction, multiprestamos_atlas = Multipréstamos Atlas). Por ahora solo registra el egreso aquí; el ingreso en el destino vendrá después. fecha opcional YYYY-MM-DD; sin fecha → hoy.",
  "Toda cifra o movimiento de Banco debe salir de query_banco o confirmarse con create_banco_movimiento. Prohibido inventar.",
  "Sin período explícito en ingresos/egresos de Banco → periodo=hoy. Cada pregunta de otro día o rango → nueva query_banco; no mezcles consultas.",
  "Si el usuario pide PDF de Banco, consulta primero con query_banco y luego generate_report_pdf con source=banco.",
]
