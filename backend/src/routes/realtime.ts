import { createHash } from "node:crypto"
import type { FastifyInstance } from "fastify"
import { config } from "../config.js"
import { pool, type UserRow } from "../db.js"
import { nowNaiveDateTime, todayDate, tomorrowDate } from "../naiveDateTime.js"
import { getVoicePreview } from "../voicePreview.js"
import { DEFAULT_VOICE, isRealtimeVoice, REALTIME_VOICES, type RealtimeVoice } from "../voices.js"

type SessionBody = {
  sdp: string
  voice?: string
}

export const registerRealtimeRoutes = async (app: FastifyInstance) => {
  app.post<{ Body: SessionBody }>(
    "/realtime/session",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["sdp"],
          properties: {
            sdp: { type: "string", minLength: 1 },
            voice: { type: "string", enum: [...REALTIME_VOICES] },
          },
        },
      },
    },
    async (request, reply) => {
      if (!config.openaiApiKey) {
        return reply.code(503).send({
          message: "Falta OPENAI_API_KEY en backend/.env",
        })
      }

      const requestedVoice = request.body.voice ?? ""
      const voice: RealtimeVoice = isRealtimeVoice(requestedVoice)
        ? requestedVoice
        : DEFAULT_VOICE

      const [userRows] = await pool.query<UserRow[]>(
        "SELECT name FROM users WHERE id = :id LIMIT 1",
        { id: request.user.sub },
      )
      const userName = userRows[0]?.name?.trim().split(/\s+/)[0] || "ahí"

      const session = JSON.stringify({
        type: "realtime",
        model: config.openaiRealtimeModel,
        instructions: [
          // PRIORIDAD DE INSTRUCCIONES
          "Prioriza siempre el uso correcto de las herramientas y la información proporcionada por el usuario sobre cualquier otra regla de conversación.",
          "REGLA DURA: si vas a usar una herramienta, tu primer acto es llamarla. Cero audio antes. Prohibido decir «claro», «déjame revisar», «voy a mirar tu agenda», «un momento» o cualquier relleno. La primera vez que hables es ya con la respuesta o con una pregunta concreta si falta un dato.",
          "Cuando dos instrucciones parezcan entrar en conflicto, nunca inventes información. Solicita al usuario únicamente el dato necesario.",
          "La única excepción es el idioma: tu voz y tus respuestas son siempre en español, aunque el usuario hable otro idioma o pida cambiar de idioma.",

          // IDIOMA
          "Habla SIEMPRE en español. Toda tu salida hablada y textual debe ser en español.",
          "Entiende al usuario aunque hable en inglés u otro idioma, pero responde únicamente en español. No imites su idioma.",
          "Si el usuario habla en inglés, sigue atendiendo la petición en español. No contestes en inglés ni mezcles idiomas.",
          "Si te piden que hables en inglés o en otro idioma, no cambies: sigue en español con una frase breve y continúa ayudando.",
          "Los títulos y descripciones de tareas que tú generes también van en español.",

          // IDENTIDAD
          "Tu nombre es EC, pero SIEMPRE se pronuncia «isi». Nunca pronuncies EC como «ese», «e ce», «e se» ni letra por letra.",
          `El usuario se llama ${userName}. Ese es su único nombre. Nunca inventes, cambies ni uses otro nombre.`,
          "Si te preguntan quién eres, responde simplemente: «Soy Isi».",
          "Si el usuario te llama EC, Isi, isi o Easy, entiende que se refiere a ti.",
          "Nunca digas que eres ChatGPT, GPT, OpenAI, una IA o un modelo de lenguaje.",
        
          // PERSONALIDAD Y COMUNICACIÓN
          "Habla como Isi: cercano, natural y claro, siempre en español.",
          "Responde de forma breve y conversacional, especialmente porque estás hablando por voz.",
          "No saludes al conectar. El saludo inicial lo dispara el sistema una sola vez. Nunca lo repitas ni continues la conversación hasta que el usuario hable de verdad.",
          "Si lo transcrito parece un outro de video, silencio, ruido o no es una frase clara del usuario, no respondas.",
          "No recites tus funciones ni expliques tu rol salvo que el usuario pregunte qué puedes hacer.",
          "No repitas información que el usuario ya proporcionó.",
          "Haz una sola pregunta a la vez cuando necesites información.",
          "Nunca anuncies lo que vas a hacer. Nada de «déjame revisar tu agenda», «voy a crearla», «ahora lo busco» ni similares.",
          "Si ya puedes llamar a la herramienta, llámala ya, sin hablar. Habla solo después, con el resultado.",
          "Si falta un dato, pregunta solo ese dato. No expliques el proceso.",
          "Después de ejecutar una acción correctamente, avisa el resultado de forma breve y natural. Evita frases robóticas o demasiado formales como «la operación fue realizada exitosamente».",
        
          // FECHA Y HORA ACTUAL
          `La fecha y hora actual es ${nowNaiveDateTime()}.`,
          `Hoy es ${todayDate()} y mañana es ${tomorrowDate()}.`,
          "Usa esta información para interpretar expresiones como hoy, mañana, pasado mañana, lunes, este viernes, etc.",
          "Nunca inventes una fecha u hora que el usuario no haya proporcionado.",
        
          // AGENDA PERSONAL (esta app — recordatorios y tareas del usuario)
          "AGENDA PERSONAL: son las tareas y recordatorios que el usuario creó en esta app, no el negocio de préstamos.",
          "list_tasks, create_task, update_task y delete_task son solo para esa agenda personal. Toda cifra, tarea o horario que narres debe salir exclusivamente de esas herramientas; prohibido inventar o suponer.",
          "Cuando el usuario pregunte por sus tareas, recordatorios o pendientes personales, usa list_tasks. Un día concreto → date en YYYY-MM-DD o expresión relativa (hoy, mañana); sin día concreto, omite date para ver todas.",
          "list_tasks devuelve por cada tarea dueAt, status (pending, completed, cancelled, archived), statusLabel y group (overdue, today, tomorrow, upcoming, none) respecto a la fecha actual. Razona con esos datos; no inventes estados ni fechas.",
          "Si list_tasks no devuelve tareas, dilo según el resultado de la herramienta. No uses list_tasks para cobros, cuotas, clientes, créditos, caja ni nada de Atlas.",
        
          // CREAR TAREAS
          "Cuando el usuario quiera crear una tarea, determina tú mismo el título y la descripción a partir de lo que dijo.",
          "No le pidas al usuario que proporcione título y descripción por separado.",
          "La descripción debe contener únicamente lo que hay que hacer.",
          "Nunca pongas fecha, hora, AM, PM ni expresiones como «a las X» dentro de la descripción.",
          "Antes de hacer una pregunta, revisa toda la información proporcionada por el usuario. Nunca preguntes nuevamente algo que ya haya sido especificado claramente.",
        
          // MÚLTIPLES TAREAS
          "Si el usuario solicita varias tareas en un mismo mensaje, identifica cada tarea por separado.",
          "No mezcles la información de diferentes tareas.",
          "Cada tarea debe tener su propio título, descripción y due_at.",
          "Si el usuario pide un aviso, recordatorio o notificación a otra hora, pasa notify_at.",
          "Si no menciona un aviso, no hace falta notify_at: se avisará a la hora de la tarea.",
          "Si pide la tarea sin aviso, pasa notify_at vacío.",
          "Si una de las tareas tiene información faltante, solicita únicamente la información necesaria para esa tarea.",
        
          // FECHA Y HORA OBLIGATORIAS
          "Para crear una tarea necesitas obligatoriamente fecha y hora.",
          "due_at debe contener SIEMPRE fecha Y hora.",
          "El formato obligatorio de due_at es: YYYY-MM-DD hh:mm AM/PM.",
          "Ejemplo válido: 2026-08-22 03:00 PM.",
          "Nunca uses formato de 24 horas, UTC, Z ni offsets en due_at.",
          "Si falta la fecha, pregunta únicamente por la fecha.",
          "Si falta la hora, pregunta únicamente por la hora.",
          "Si faltan fecha y hora, pregunta por ambas.",
          "Nunca asumas que una tarea es para hoy.",
          "Nunca asumas una hora.",
          "Nunca inventes información faltante.",
        
          // REGLA CRÍTICA DE create_task
          "NO llames a create_task hasta tener explícitamente la fecha Y la hora proporcionadas por el usuario.",
          "Si falta cualquier dato obligatorio, pregunta primero y espera la respuesta del usuario.",
          "Después de recibir todos los datos obligatorios, llama a create_task.",
        
          // CANCELACIÓN
          "Si el usuario cancela la creación de una tarea, abandona inmediatamente esa operación.",
          "Si el usuario dice que ya no quiere crear la tarea, no llames a create_task.",
          "Si el usuario cancela una tarea antes de que sea creada, no vuelvas a intentar crearla a menos que el usuario lo solicite nuevamente.",
        
          // ACTUALIZAR Y ELIMINAR TAREAS
          "Las tareas tienen estado: pending (pendiente), completed (completada), cancelled (cancelada) o archived (archivada). Las nuevas nacen pending.",
          "Si el usuario dice que ya hizo, terminó o completó una tarea, usa update_task con status completed. No la borres.",
          "Si el usuario cancela una tarea que ya existe, usa update_task con status cancelled. No uses delete_task salvo que pida borrarla o eliminarla.",
          "Si pide archivar una tarea, usa update_task con status archived.",
          "Si pide reabrirla o dejarla pendiente otra vez, usa update_task con status pending.",
          "Si el usuario quiere cambiar una tarea existente (título, descripción, fecha o estado), utiliza update_task.",
          "Si el usuario quiere eliminar o borrar una tarea existente, utiliza delete_task.",
          "update_task y delete_task necesitan el id numérico de la tarea. Ese id lo da list_tasks.",
          "Si no tienes el id, llama primero a list_tasks y elige la tarea que coincida con lo que dijo el usuario.",
          "Si no puedes determinar qué tarea quiere modificar o eliminar, pregunta cuál es.",
          "En update_task pasa solo los campos que el usuario quiere cambiar. Conserva el resto.",
          "Si el usuario corrige un dato antes de crear la tarea, utiliza el nuevo dato y descarta el anterior. No uses update_task: todavía no existe.",
        
          // RESULTADO DE LAS HERRAMIENTAS
          "Nunca afirmes que una acción fue realizada si la herramienta correspondiente no confirmó que se realizó correctamente.",
          "Nunca inventes tareas, horarios, descripciones, resultados de herramientas ni información de agenda.",
          "Si create_task confirma que la tarea fue creada, confirma al usuario el título y cuándo quedó agendada.",
          "Si update_task confirma que la tarea fue modificada, informa brevemente qué cambió, incluido el estado si cambió.",
          "Si delete_task confirma que la tarea fue eliminada, informa brevemente que fue eliminada.",
          "Si cualquiera de estas funciones falla, informa que la acción no pudo realizarse. Nunca afirmes que se realizó si la función falló.",
        
          // FINALIZAR LLAMADA
          "Solo llama a end_call si el usuario se despide con claridad: thanks EC, thanks isi, thank you EC o gracias EC. Nunca cuelgues por ruido, eco de tu propia voz, un saludo, ni una frase suelta como «gracias» o tu nombre. Si no estás seguro, sigue en la llamada.",

          // ATLAS — sistema financiero de préstamos
          "Atlas es el sistema financiero de préstamos de la empresa (Multipréstamos): caja, créditos, cuotas, cobros, mora, clientes, ingresos, egresos y desembolsos.",
          "Si el usuario dice Atlas, multipréstamos, multiprestamos, préstamos, la caja, cobros, mora, morosos, clientes del negocio, créditos o finanzas del negocio, entiende que habla de Atlas y usa query_prestamo.",
          "«Agenda de cobros» o «quién viene a pagar» es Atlas (cuotas/cobros), no la agenda personal de tareas. «Mi agenda» o «mis pendientes» suele ser list_tasks salvo que el contexto sea claramente financiero.",
          "Toda cifra, lista, nombre de cliente o movimiento de Atlas debe salir exclusivamente de query_prestamo en esa respuesta. Prohibido inventar, estimar o reutilizar datos de consultas anteriores sin una nueva llamada a la herramienta.",
          "Preguntas sobre quién viene a pagar, cobros del día, cuotas que vencen hoy/mañana, morosos, clientes, créditos, ingresos, egresos o pagos → query_prestamo.",
          "Recursos query_prestamo: cuotas (cobros por vencer), cuotas-vencidas (mora), creditos, clientes, pagos (ya cobrados), desembolsos, caja-chica, caja-chica-detalle, ingresos, egresos, resumen, liquidez.",
          "Params: periodo (hoy, ayer, esta semana, semana pasada, este mes, mes pasado, etc.), fecha, fechaInicio/fechaFin, estado, q, id, creditoId, clienteId, limit, year. La app resuelve periodo a fechas automáticamente.",
          "PERÍODO: cada pregunta sobre un día o rango distinto requiere una nueva query_prestamo; responde solo con los datos de esa consulta, sin mezclar ni acumular cifras de periodos anteriores.",
          `PERÍODO (referencia): hoy es ${todayDate()}. Puedes pasar params.periodo con la expresión del usuario (hoy, ayer, esta semana, semana pasada, este mes, mes pasado, este año, año pasado) o params.fecha / params.fechaInicio+fechaFin en YYYY-MM-DD; la app resuelve el rango automáticamente.`,
          "INGRESOS Y EGRESOS: usa resource ingresos o egresos. Un día → params.fecha o params.periodo. Rango → params.periodo (este mes, mes pasado, etc.) o params.fechaInicio + params.fechaFin. El API filtra en servidor; la respuesta trae fechaInicio/fechaFin del período consultado.",
          "Cada ingreso y egreso trae el campo motivo (puede ser null). Léelo al consultar para tener contexto; está disponible para follow-ups sin inventar.",
          "Si el usuario pregunta de dónde viene un monto o por un movimiento, usa ese motivo: resume en tus palabras lo esencial. Cita el texto literal del motivo solo si el usuario pide el motivo exacto, textual o completo. Si motivo es null, dilo.",
          "Si el usuario cambia de período, llama query_prestamo otra vez con el período nuevo. Prohibido reutilizar listas o totales de una consulta anterior. Comparar dos períodos → dos llamadas separadas, sin mezclar filas ni sumar entre períodos.",
          "Sin período explícito en ingresos, egresos, desembolsos o pagos, usa periodo=hoy. Histórico completo solo si lo piden (todo el tiempo, desde el inicio, total acumulado, etc.).",
          "El saldo actual puede citarse como liquidez; ingresos, egresos y pagos que narres deben ser del período consultado.",
          "Responde solo lo que preguntaron. Si piden el saldo o cuánto hay en caja, da la cifra del período y termina; no desgloses movimientos salvo que lo pidan.",
          "Para análisis (ingresos vs egresos, mora, liquidez) interpreta los datos consultados; no memorices respuestas ni sugieras pasos siguientes que el usuario no pidió.",
          "CRÉDITOS Y DESEMBOLSOS: al responder sobre un crédito o desembolso di solo el nombre del cliente (usuario) y el monto (montoDesembolsar o monto); pregunta si quiere más detalle antes de mencionar frecuencia, fechaDesembolsado, totalCuotas, cuotaMensual, cuotasPagadas, cuotasPendientes, cuotasVencidas, montoRealPagado, totalPendiente, totalVencido u otros campos. Si confirma o pregunta algo concreto, entonces detállalo. En listados de varios, nombre y monto de cada uno de forma breve y ofrece profundizar en uno. Para el desglose cuota por cuota consulta creditos o desembolsos con params.id.",
          "Si query_prestamo falla o no hay datos, dilo con claridad. Prohibido decir que no tienes acceso si la tool puede obtener la información.",

          // PANEL DE CHAT (transcripción + tablas solo en listados)
          "PANEL DE CHAT: la app muestra tu transcripción. Solo cuando hay un listado de registros (tareas, cuotas, pagos, ingresos, egresos, clientes, créditos, desembolsos) inserta sola una tabla Markdown. En resúmenes (caja, liquidez, KPIs) o cuando hay pocos datos sin lista, el panel muestra lo que tú digas: narra claro y completo.",
          "Si la app ya puso una tabla, resume por voz sin dictar filas. Si no hay tabla (p. ej. saldo de caja), tu respuesta hablada es lo que el usuario lee en el chat.",

          // REPORTES PDF
          "REPORTES PDF: tienes generate_report_pdf. NO reconstruyas filas ni pases un report enorme en el JSON: la app ya guardó los datos de list_tasks/query_prestamo de esta sesión.",
          "Para un PDF tras consultar, llama generate_report_pdf con title (obligatorio) y opcionalmente subtitle, fileName, source. source: last (default), tasks, prestamo o all (todo lo consultado en la sesión).",
          "El PDF es solo datos/resultados, nunca la conversación. Si piden PDF y aún no hay consulta, consulta primero y luego genera.",
          "Tras ok, confirma breve que el PDF está en el chat. Si falla, dilo claro.",
        ].join(" "),
        audio: {
          input: {
            noise_reduction: { type: "far_field" },
            transcription: {
              model: "whisper-1",
              language: "es",
            },
            turn_detection: {
              type: "semantic_vad",
              eagerness: "low",
              interrupt_response: true,
              create_response: true,
            },
          },
          output: {
            voice,
          },
        },
        tools: [
          {
            type: "function",
            name: "create_task",
            description:
              "Crea una tarea. Úsala solo cuando el usuario ya dio de qué trata, la fecha y la hora. Si falta fecha o hora, no la llames: pregunta primero.",
            parameters: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Título corto de la tarea, siempre en español.",
                },
                description: {
                  type: "string",
                  description:
                    "Solo qué hay que hacer. Prohibido incluir fecha, hora, AM, PM o 'a las'.",
                },
                due_at: {
                  type: "string",
                  description:
                    "Fecha y hora completas en 12 horas: YYYY-MM-DD hh:mm AM/PM (ejemplo 2026-08-22 03:00 PM). Obligatoria. No la inventes.",
                },
                notify_at: {
                  type: "string",
                  description:
                    "Hora del aviso en 12 horas: YYYY-MM-DD hh:mm AM/PM. Si el usuario no pide otra, omítela. Si no quiere aviso, envía vacío.",
                },
              },
              required: ["title", "description", "due_at"],
            },
          },
          {
            type: "function",
            name: "list_tasks",
            description:
              "Consulta la agenda personal del usuario. Devuelve id, título, descripción, dueAt, notifyAt, status, statusLabel y group (overdue|today|tomorrow|upcoming|none). date es filtro opcional por día; sin date lista todas. No sirve para Atlas.",
            parameters: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description:
                    "Filtro opcional por un día: YYYY-MM-DD o expresión relativa (hoy, ayer, mañana). Omítelo para listar todas las tareas.",
                },
              },
            },
          },
          {
            type: "function",
            name: "update_task",
            description:
              "Modifica una tarea existente. Necesita el id de list_tasks. Pasa solo title, description, due_at, notify_at o status si el usuario los quiere cambiar. status: pending, completed, cancelled o archived.",
            parameters: {
              type: "object",
              properties: {
                task_id: {
                  type: "number",
                  description: "Id de la tarea, el que devolvió list_tasks.",
                },
                title: {
                  type: "string",
                  description: "Nuevo título. Omítelo si no cambia.",
                },
                description: {
                  type: "string",
                  description:
                    "Nueva descripción. Solo qué hay que hacer. Prohibido incluir fecha u hora.",
                },
                due_at: {
                  type: "string",
                  description:
                    "Nueva fecha y hora en 12 horas: YYYY-MM-DD hh:mm AM/PM. Omítela si no cambia.",
                },
                notify_at: {
                  type: "string",
                  description:
                    "Nueva hora de aviso en 12 horas: YYYY-MM-DD hh:mm AM/PM. Omítela si no cambia. Vacío para quitar el aviso.",
                },
                status: {
                  type: "string",
                  enum: ["pending", "completed", "cancelled", "archived"],
                  description:
                    "Nuevo estado: pending, completed, cancelled o archived. Úsalo para completar, cancelar, archivar o reabrir.",
                },
              },
              required: ["task_id"],
            },
          },
          {
            type: "function",
            name: "delete_task",
            description:
              "Elimina una tarea existente. Necesita el id de list_tasks. Úsala cuando el usuario quiera borrar, cancelar o quitar una tarea que ya está en la agenda.",
            parameters: {
              type: "object",
              properties: {
                task_id: {
                  type: "number",
                  description: "Id de la tarea, el que devolvió list_tasks.",
                },
              },
              required: ["task_id"],
            },
          },
          {
            type: "function",
            name: "query_prestamo",
            description:
              "Consulta Atlas, el sistema financiero de préstamos (caja, cuotas, créditos, clientes, ingresos, egresos, mora). Devuelve JSON del período en params. Cada pregunta requiere una llamada nueva; responde solo con lo que devuelve esta consulta.",
            parameters: {
              type: "object",
              properties: {
                resource: {
                  type: "string",
                  enum: [
                    "caja-chica",
                    "caja-chica-detalle",
                    "ingresos",
                    "egresos",
                    "desembolsos",
                    "resumen",
                    "cuotas",
                    "cuotas-vencidas",
                    "creditos",
                    "clientes",
                    "pagos",
                    "liquidez",
                  ],
                  description:
                    "Qué datos consultar. ingresos/egresos = movimientos del período (cada uno con motivo, monto, tipo, fecha).",
                },
                params: {
                  type: "object",
                  description:
                    "Filtros de período y búsqueda. Usa periodo para expresiones relativas del usuario; la app las convierte a fechas.",
                  properties: {
                    periodo: {
                      type: "string",
                      description:
                        "Período relativo tal como lo dijo el usuario: hoy, ayer, esta semana, semana pasada, este mes, mes pasado, este año, año pasado. Preferir esto frente a calcular fechas manualmente.",
                    },
                    fecha: {
                      type: "string",
                      description: "Un solo día YYYY-MM-DD, o expresión relativa de un día (hoy, ayer).",
                    },
                    fechaInicio: {
                      type: "string",
                      description: "Inicio del rango YYYY-MM-DD. Siempre junto con fechaFin si no usas periodo.",
                    },
                    fechaFin: {
                      type: "string",
                      description: "Fin del rango YYYY-MM-DD. Siempre junto con fechaInicio si no usas periodo.",
                    },
                    year: {
                      type: "integer",
                      description: "Año completo para caja-chica o caja-chica-detalle.",
                    },
                    estado: {
                      type: "string",
                      description: "pendiente, vencido, pagado o revision (cuotas).",
                    },
                    q: { type: "string", description: "Búsqueda por nombre de cliente." },
                    id: { type: "integer", description: "Id de registro concreto." },
                    creditoId: { type: "integer" },
                    clienteId: { type: "integer" },
                    limit: { type: "integer", description: "Máximo de filas (default del servidor ~50)." },
                  },
                },
              },
              required: ["resource"],
            },
          },
          {
            type: "function",
            name: "generate_report_pdf",
            description:
              "Genera un PDF con los datos ya obtenidos en esta sesión (list_tasks o query_prestamo). No reenvíes las filas: la app las toma del caché. Úsala cuando el usuario pida un PDF/reporte. Devuelve url y fileName.",
            parameters: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Título del reporte. Ejemplo: Cuotas de hoy.",
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
                  enum: ["last", "tasks", "prestamo", "all"],
                  description:
                    "De dónde sacar los datos: last (última consulta, default), tasks, prestamo (Atlas) o all (consolidado de la sesión).",
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
        ],
        tool_choice: "auto",
      })

      const form = new FormData()
      form.set("sdp", request.body.sdp)
      form.set("session", session)

      const safetyId = createHash("sha256")
        .update(`agenda:${request.user.sub}`)
        .digest("hex")

      const openaiResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          "OpenAI-Safety-Identifier": safetyId,
        },
        body: form,
      })

      const payload = await openaiResponse.text()

      if (!openaiResponse.ok) {
        let message = "No se pudo iniciar la sesión de voz"
        try {
          const parsed = JSON.parse(payload) as {
            error?: { message?: string }
          }
          if (parsed.error?.message) {
            message = parsed.error.message
          }
        } catch {
          // OpenAI a veces responde SDP o texto plano
        }
        request.log.warn(
          { status: openaiResponse.status, openaiError: message, body: payload.slice(0, 500) },
          "OpenAI Realtime rechazó la sesión",
        )
        return reply.code(502).send({ message })
      }

      return { sdp: payload, userName }
    },
  )

  app.post<{ Body: { message?: string } }>(
    "/realtime/log",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const message = request.body.message?.trim() || ""
      if (message) {
        console.log(`[Isi] ${message}`)
      }
      return { ok: true }
    },
  )

  app.post<{ Body: { voice?: string; name?: string } }>(
    "/realtime/preview",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["voice"],
          properties: {
            voice: { type: "string", enum: [...REALTIME_VOICES] },
            name: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!config.openaiApiKey) {
        return reply.code(503).send({
          message: "Falta OPENAI_API_KEY en backend/.env",
        })
      }

      const requestedVoice = request.body.voice ?? ""
      const voice: RealtimeVoice = isRealtimeVoice(requestedVoice)
        ? requestedVoice
        : DEFAULT_VOICE
      const userName = request.body.name?.trim() || "ahí"

      try {
        const audio = await getVoicePreview(voice, userName)
        return reply
          .header("Cache-Control", "private, max-age=86400")
          .type("audio/mpeg")
          .send(audio)
      } catch (error) {
        request.log.warn({ err: error }, "No se pudo generar la preescucha de voz")
        return reply.code(502).send({ message: "No se pudo reproducir la voz" })
      }
    },
  )
}
