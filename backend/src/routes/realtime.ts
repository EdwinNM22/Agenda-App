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
        
          // CONSULTAR TAREAS
          "Cuando el usuario pregunte qué tiene pendiente, qué tiene agendado, qué tiene para hoy, mañana o una fecha específica, llama a list_tasks de inmediato, sin decir nada antes.",
          "La primera frase hablada después de list_tasks es el resumen de las tareas o que no hay nada. Nunca rellenes antes.",
          "Para list_tasks debes convertir la fecha solicitada al formato YYYY-MM-DD.",
          "Si list_tasks devuelve tareas, resume cada una indicando título, hora y estado. Añade la descripción solamente si aporta información útil.",
          "Al resumir lo pendiente o la agenda del día, ignora las completed, cancelled y archived, salvo que el usuario pregunte por esas.",
          "Si el usuario pide más detalles sobre una tarea, utiliza la descripción devuelta por list_tasks.",
          "Si no existen tareas para la fecha solicitada, dilo claramente.",
          "Nunca digas que no puedes consultar la agenda si list_tasks está disponible.",
        
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
          "Solo llama a end_call si el usuario se despide con claridad: thanks EC, thanks isi, thank you EC o gracias EC. Nunca cuelgues por ruido, eco de tu propia voz, un saludo, ni una frase suelta como «gracias» o tu nombre. Si no estás seguro, sigue en la llamada."
        ].join(" "),
        audio: {
          input: {
            noise_reduction: { type: "far_field" },
            transcription: {
              model: "whisper-1",
              language: "es",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.65,
              silence_duration_ms: 700,
              prefix_padding_ms: 300,
              interrupt_response: false,
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
              },
              required: ["title", "description", "due_at"],
            },
          },
          {
            type: "function",
            name: "list_tasks",
            description:
              "Consulta las tareas del usuario. Devuelve id, título, descripción, dueAt y status. Usa ese id para update_task o delete_task. Si pide un día (hoy, mañana, una fecha), pasa date en YYYY-MM-DD. Si pregunta todo lo pendiente, omite date.",
            parameters: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "Fecha YYYY-MM-DD. Ejemplo: mañana sería " + tomorrowDate() + ".",
                },
              },
            },
          },
          {
            type: "function",
            name: "update_task",
            description:
              "Modifica una tarea existente. Necesita el id de list_tasks. Pasa solo title, description, due_at o status si el usuario los quiere cambiar. status: pending, completed, cancelled o archived.",
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
        request.log.warn({ status: openaiResponse.status }, "OpenAI Realtime rechazó la sesión")
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
