import type { SessionContext } from "../types.js"

/** Prompt de saludo inicial enviado por el cliente vía response.create al conectar la llamada. */
export const buildGreetingInstruction = (userName: string): string =>
  `Acaba de empezar la llamada. Saluda a ${userName} EN ESPAÑOL, en una sola frase, cercana y breve (por ejemplo «Hola, ${userName}, soy Isi»). Preséntate como Isi. No listes funciones ni preguntes qué puede hacer. No sigas hablando después. Espera en silencio a que te hablen. A partir de la primera frase del usuario, responde en el idioma en que te hable; mientras no hable, el idioma es español. Nunca digas que no puedes hablar otro idioma.`

export const buildGreetingInstructionFromContext = (ctx: Pick<SessionContext, "userName">): string =>
  buildGreetingInstruction(ctx.userName)
