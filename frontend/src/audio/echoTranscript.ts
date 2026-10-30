/**
 * Verificación por contenido: ¿esta transcripción «del usuario» es en realidad lo que acaba de
 * decir el asistente (eco)? Es la última línea de defensa y no depende de niveles de audio ni de
 * temporizadores: el eco transcrito repite palabras del asistente casi literalmente.
 *
 * Solo se aplica a segmentos que se solaparon con la reproducción y que el detector local no
 * confirmó como voz del usuario, para no descartar peticiones legítimas.
 */

const normalize = (value: string): string[] =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)

/** Tramo mínimo de palabras seguidas que cuenta como «repite al asistente». */
const MIN_RUN = 3

export type EchoVerdict = {
  /** Cuántas palabras tiene la transcripción (normalizada). */
  tokens: number
  /**
   * Fracción de las palabras que forman parte de tramos de ≥3 palabras consecutivas copiados
   * literalmente de lo dicho por el asistente (0..1).
   */
  coverage: number
  isEcho: boolean
}

/** Marca qué palabras de `heard` pertenecen a un tramo de ≥ MIN_RUN idéntico a uno de `assistant`. */
const coveredByRuns = (heard: string[], assistant: string[]): boolean[] => {
  const covered = new Array<boolean>(heard.length).fill(false)
  // longest[i][j] = longitud del tramo común que termina en heard[i] / assistant[j]
  let previous = new Array<number>(assistant.length + 1).fill(0)
  for (let i = 0; i < heard.length; i += 1) {
    const current = new Array<number>(assistant.length + 1).fill(0)
    for (let j = 0; j < assistant.length; j += 1) {
      if (heard[i] === assistant[j]) {
        const run = (previous[j] ?? 0) + 1
        current[j + 1] = run
        if (run >= MIN_RUN) {
          for (let k = 0; k < run; k += 1) {
            covered[i - k] = true
          }
        }
      }
    }
    previous = current
  }
  return covered
}

/**
 * Compara `heard` con los textos recientes del asistente. Es eco si la mayor parte de lo «oído»
 * son tramos copiados literalmente. Las palabras sueltas en común («las», «de», «la») no cuentan:
 * una petición nueva que reutiliza vocabulario del asistente no se confunde con eco.
 */
export const judgeTranscriptAgainstAssistant = (
  heard: string,
  assistantTexts: string[],
): EchoVerdict => {
  const heardTokens = normalize(heard)
  if (heardTokens.length === 0) {
    return { tokens: 0, coverage: 0, isEcho: true }
  }

  const assistantTokens = normalize(assistantTexts.join(" "))
  if (assistantTokens.length === 0) {
    return { tokens: heardTokens.length, coverage: 0, isEcho: false }
  }

  const covered = coveredByRuns(heardTokens, assistantTokens)
  const coverage = covered.filter(Boolean).length / heardTokens.length

  // Menos de 3 palabras no permiten afirmar que es eco (p. ej. «sí», «a las tres»).
  const isEcho = heardTokens.length >= MIN_RUN && coverage >= 0.65
  return { tokens: heardTokens.length, coverage, isEcho }
}

/** Texto reciente dicho por el asistente (transcripción de su audio), para la comparación. */
export const createAssistantSpeechLog = (maxResponses = 4, maxChars = 900) => {
  const finished: string[] = []
  const inProgress = new Map<string, string>()

  const trim = () => {
    while (finished.length > maxResponses) {
      finished.shift()
    }
  }

  return {
    delta: (responseId: string, text: string) => {
      inProgress.set(responseId, `${inProgress.get(responseId) ?? ""}${text}`)
    },
    done: (responseId: string, text?: string) => {
      const full = (text ?? inProgress.get(responseId) ?? "").trim()
      inProgress.delete(responseId)
      if (full) {
        finished.push(full)
        trim()
      }
    },
    /** Lo más reciente primero que cabe en `maxChars`. */
    recent: (): string[] => {
      const all = [...finished, ...inProgress.values()]
      const out: string[] = []
      let size = 0
      for (let i = all.length - 1; i >= 0; i -= 1) {
        const item = all[i]!
        size += item.length
        out.unshift(item)
        if (size >= maxChars) {
          break
        }
      }
      return out
    },
    clear: () => {
      finished.length = 0
      inProgress.clear()
    },
  }
}
