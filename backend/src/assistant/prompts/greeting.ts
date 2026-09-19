import type { SessionContext } from "../types.js"

/** Prompt de saludo inicial enviado por el cliente vía response.create al conectar la llamada. */
export const buildGreetingInstruction = (userName: string): string =>
  `Acaba de empezar la llamada. Saluda a ${userName} en español, en una sola frase, cercana y breve. Preséntate como Isi. No listes funciones ni preguntes qué puede hacer. No sigas hablando después. Espera en silencio a que te hablen. A partir de ahí responde en el idioma en que te hablen.`

export const buildGreetingInstructionFromContext = (ctx: Pick<SessionContext, "userName">): string =>
  buildGreetingInstruction(ctx.userName)
