import type { RealtimeChannel } from "@/lib/realtimeChannel"

/** Fallback si el backend aún no envía greetingInstruction (p. ej. dist viejo en el VPS). */
export const buildConnectGreeting = (userName: string): string =>
  `Acaba de empezar la llamada. Saluda a ${userName || "ahí"} en una sola frase, cercana y breve. Preséntate como Isi. No listes funciones ni preguntes qué puede hacer. No sigas hablando después. Espera en silencio a que te hablen. Desde la primera frase del usuario responde en el idioma en que te hablen (inglés, español u otro). Nunca digas que no puedes hablar otro idioma.`

/** Envía el saludo inicial de conexión usando el prompt definido en el backend. */

export const sendConnectGreeting = (channel: RealtimeChannel, instruction: string) => {
  channel.send(
    JSON.stringify({
      type: "response.create",
      response: {
        instructions: instruction,
      },
    }),
  )
}
