import { isToolLeadInText } from "@/lib/assistantToolLeadIn"

/**
 * Red de seguridad contra los preámbulos hablados («claro, vamos a revisar…») que gpt-realtime-2.x
 * genera por defecto antes de llamar a una tool. El prompt los reduce mucho pero el modelo no
 * obedece al 100 %, y como el audio se genera antes de saber si habrá tool, solo se puede cortar
 * cuando la transcripción lo delata.
 *
 * Al detectar uno: silencia el reproductor, vacía el audio pendiente (`output_audio_buffer.clear`)
 * y deja la respuesta seguir (la llamada a la tool no se cancela).
 *
 * Seguridad: el silencio es SIEMPRE acotado. Termina en el siguiente `response.created` (la
 * respuesta posterior a la tool) o `TAIL_MS` después de `response.done`, lo que ocurra antes, así
 * que un falso positivo nunca deja el audio mudo.
 */
export type PreambleSuppressorDeps = {
  setMuted: (muted: boolean) => void
  /** Vacía el audio ya en cola en el servidor (solo WebRTC). */
  clearOutput: () => void
  log?: (message: string) => void
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export type PreambleSuppressor = {
  handleEvent: (event: Record<string, unknown>) => void
  /** Devuelve el reproductor a su estado normal (colgar, reconectar). */
  reset: () => void
}

const TAIL_MS = 1500

const str = (value: unknown): string => (typeof value === "string" ? value : "")

export const createPreambleSuppressor = (deps: PreambleSuppressorDeps): PreambleSuppressor => {
  const setTimer = deps.setTimer ?? ((callback, ms) => globalThis.setTimeout(callback, ms))
  const clearTimer =
    deps.clearTimer ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>))

  let responseId = ""
  let transcript = ""
  let suppressed = false
  let tailTimer: unknown = null

  const unmute = () => {
    if (tailTimer !== null) {
      clearTimer(tailTimer)
      tailTimer = null
    }
    if (suppressed) {
      suppressed = false
      deps.setMuted(false)
    }
  }

  const handleEvent = (event: Record<string, unknown>) => {
    const type = str(event.type)

    if (type === "response.created") {
      // Fin del silencio: la respuesta posterior a la tool (o cualquier otra) debe oírse.
      unmute()
      const response = event.response as { id?: string } | undefined
      responseId = response?.id ?? ""
      transcript = ""
      return
    }

    if (type.includes("audio_transcript.delta")) {
      if (suppressed) {
        return
      }
      const id = str(event.response_id)
      if (id && responseId && id !== responseId) {
        return
      }
      transcript += str(event.delta)
      if (transcript.length <= 320 && isToolLeadInText(transcript)) {
        suppressed = true
        deps.setMuted(true)
        deps.clearOutput()
        deps.log?.(`preámbulo cortado: «${transcript.trim()}»`)
      }
      return
    }

    if (type === "response.done") {
      transcript = ""
      if (suppressed && tailTimer === null) {
        tailTimer = setTimer(() => {
          tailTimer = null
          unmute()
        }, TAIL_MS)
      }
    }
  }

  return { handleEvent, reset: unmute }
}
