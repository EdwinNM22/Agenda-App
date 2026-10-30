/**
 * Nota que se añade al JSON de una tool cuando la app ya muestra sus filas en el chat.
 * Va en inglés a propósito: no debe empujar el idioma de la respuesta hacia español.
 *
 * Importante: el `response.create` posterior a una tool NO debe llevar `instructions`. En Realtime
 * ese campo SUSTITUYE las instrucciones de la sesión en esa respuesta, y con ellas se pierden las
 * reglas de estilo, idioma y modo voz (el modelo vuelve a rellenar: «si quieres, puedo ayudarte
 * a…»). Las reglas viven en la sesión; aquí solo se añade contexto en el propio resultado.
 */
export const APP_DISPLAY_NOTE =
  "The app is already showing these records to the user on screen. Do not read or repeat the rows. At most one short sentence with the key figure (count, total, or what needs attention)."
