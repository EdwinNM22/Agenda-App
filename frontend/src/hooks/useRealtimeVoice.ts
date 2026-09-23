import { useCallback, useEffect, useRef, useState } from "react"
import {
  captureMicrophone,
  describeMicError,
  releaseCallAudioSession,
  stopMicrophone,
  setAudioSessionType,
} from "@/audio/audioSession"
import { api } from "@/lib/api"
import { handleAssistantChatEvent, responseIdFrom } from "@/lib/assistantChatEvents"
import { channelFromWebSocket, type RealtimeChannel } from "@/lib/realtimeChannel"
import { handleRealtimeServerEvent } from "@/hooks/handleRealtimeServerEvent"
import { buildConnectGreeting, sendConnectGreeting } from "@/assistant/runtime/greeting"
import { handleRealtimeToolEvent } from "@/lib/realtimeTools"
import { clearSessionToolData } from "@/lib/sessionToolData"
import { useAssistantChatMessages } from "@/hooks/useAssistantChatMessages"
import { isHangupCommand } from "@/lib/voiceCommands"
import type { RealtimeVoice } from "@/lib/voices"

export type VoiceStatus = "idle" | "connecting" | "live" | "error"
export type TextChatStatus = "idle" | "connecting" | "ready"

export type ToolActivity =
  | "create_task"
  | "update_task"
  | "delete_task"
  | "query_prestamo"
  | "query_banco"
  | "create_banco_movimiento"
  | "generate_report_pdf"
  | null

export type { AssistantMessage } from "@/lib/assistantChatEvents"

const TOOL_ACTIVITY = new Set([
  "create_task",
  "update_task",
  "delete_task",
  "query_prestamo",
  "query_banco",
  "create_banco_movimiento",
  "generate_report_pdf",
])

const pickActivity = (names: string[]): ToolActivity => {
  if (names.includes("generate_report_pdf")) {
    return "generate_report_pdf"
  }
  if (names.includes("query_prestamo")) {
    return "query_prestamo"
  }
  if (names.includes("query_banco") || names.includes("create_banco_movimiento")) {
    return "query_banco"
  }
  if (names.includes("create_task")) {
    return "create_task"
  }
  if (names.includes("delete_task")) {
    return "delete_task"
  }
  if (names.includes("update_task")) {
    return "update_task"
  }
  return null
}

let assistantHeardBuffer = ""
let assistantSaidBuffer = ""

const logIsi = (label: string, extra?: unknown) => {
  const line =
    extra === undefined || extra === ""
      ? label
      : `${label} ${typeof extra === "string" ? extra : JSON.stringify(extra)}`
  console.log(`[Isi] ${line}`)
  void api("/realtime/log", {
    method: "POST",
    body: JSON.stringify({ message: line }),
  }).catch(() => undefined)
}

const nestedTranscript = (event: Record<string, unknown>) => {
  if (typeof event.transcript === "string" && event.transcript.trim()) {
    return event.transcript.trim()
  }
  const item = event.item as { content?: Array<{ transcript?: string }> } | undefined
  const fromItem = item?.content?.find((part) => part.transcript?.trim())?.transcript
  return fromItem?.trim() || ""
}

const logAssistantHearing = (event: Record<string, unknown>) => {
  const type = typeof event.type === "string" ? event.type : ""
  const delta = typeof event.delta === "string" ? event.delta : ""

  if (type === "input_audio_buffer.speech_started") {
    assistantHeardBuffer = ""
    logIsi("empezó a oír")
    return
  }
  if (type === "input_audio_buffer.speech_stopped") {
    logIsi("dejó de oír")
    return
  }
  if (type.includes("input_audio_transcription.delta") && delta) {
    assistantHeardBuffer += delta
    return
  }
  if (type.includes("input_audio_transcription.completed")) {
    const heard = nestedTranscript(event) || assistantHeardBuffer
    assistantHeardBuffer = ""
    logIsi("escuchó:", heard || "(vacío)")
    return
  }
  if (type.includes("input_audio_transcription.failed")) {
    logIsi("no pudo transcribir lo que oyó")
    return
  }
  if (type === "conversation.item.created") {
    const heard = nestedTranscript(event)
    if (heard) {
      logIsi("escuchó:", heard)
    }
    return
  }
  if (type === "response.created") {
    logIsi("empezó a hablar")
    return
  }
  if ((type.includes("output_audio_transcript.delta") || type.includes("audio_transcript.delta")) && delta) {
    assistantSaidBuffer += delta
    return
  }
  if (type.includes("output_audio_transcript.done") || type === "response.audio_transcript.done") {
    const said = nestedTranscript(event) || assistantSaidBuffer
    assistantSaidBuffer = ""
    logIsi("dijo:", said || "(sin texto)")
    return
  }
  if (type === "response.done") {
    if (assistantSaidBuffer.trim()) {
      logIsi("dijo:", assistantSaidBuffer.trim())
      assistantSaidBuffer = ""
    }
    logIsi("terminó de hablar")
  }
}

const waitForIce = (peer: RTCPeerConnection) =>
  new Promise<void>((resolve) => {
    if (peer.iceGatheringState === "complete") {
      resolve()
      return
    }
    const done = () => {
      peer.removeEventListener("icegatheringstatechange", onChange)
      resolve()
    }
    const onChange = () => {
      if (peer.iceGatheringState === "complete") {
        done()
      }
    }
    peer.addEventListener("icegatheringstatechange", onChange)
    window.setTimeout(done, 2000)
  })

export const useRealtimeVoice = () => {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const seenCallIdsRef = useRef<Set<string>>(new Set())
  const generationRef = useRef(0)
  const responseOpenRef = useRef(0)
  const toolsInFlightRef = useRef(0)
  const awaitingResponseRef = useRef(false)
  const greetedRef = useRef(false)
  const greetingPlayingRef = useRef(false)
  const isiSpeakingRef = useRef(false)
  const lastUserTranscriptRef = useRef("")
  const isiQuietTimerRef = useRef(0)
  const awaitingTimerRef = useRef(0)
  const [busy, setBusy] = useState(false)
  const [hearingUser, setHearingUser] = useState(false)
  const toolsRef = useRef<string[]>([])
  const [activity, setActivity] = useState<ToolActivity>(null)
  const {
    messages,
    resetMessages,
    appendPdfReport,
    appendMarkdownMessage,
    appendUserMessage,
    clearVoiceSkip,
    chatController,
  } = useAssistantChatMessages()
  const appendPdfReportRef = useRef(appendPdfReport)
  appendPdfReportRef.current = appendPdfReport
  const appendMarkdownMessageRef = useRef(appendMarkdownMessage)
  appendMarkdownMessageRef.current = appendMarkdownMessage
  const appendUserMessageRef = useRef(appendUserMessage)
  appendUserMessageRef.current = appendUserMessage
  const clearVoiceSkipRef = useRef(clearVoiceSkip)
  clearVoiceSkipRef.current = clearVoiceSkip
  const pendingTextRef = useRef("")
  const skipGreetingRef = useRef(false)
  const statusRef = useRef<VoiceStatus>("idle")
  const startVoiceRef = useRef<RealtimeVoice | null>(null)
  const textWsRef = useRef<WebSocket | null>(null)
  const textChannelRef = useRef<RealtimeChannel | null>(null)
  const textGenerationRef = useRef(0)
  const textConnectPromiseRef = useRef<Promise<void> | null>(null)
  const textOutboxRef = useRef<string[]>([])
  const textSeenCallIdsRef = useRef<Set<string>>(new Set())
  const [textStatus, setTextStatus] = useState<TextChatStatus>("idle")

  const setVoiceStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const syncActivity = useCallback(() => {
    const next = pickActivity(toolsRef.current)
    setActivity((prev) => (prev === next ? prev : next))
  }, [])

  const syncBusy = useCallback(() => {
    const next =
      responseOpenRef.current > 0 ||
      toolsInFlightRef.current > 0 ||
      awaitingResponseRef.current ||
      greetingPlayingRef.current ||
      isiSpeakingRef.current
    setBusy((prev) => (prev === next ? prev : next))
  }, [])

  const releaseCall = useCallback(() => {
    peerRef.current?.close()
    peerRef.current = null
    channelRef.current = null
    seenCallIdsRef.current = new Set()
    responseOpenRef.current = 0
    toolsInFlightRef.current = 0
    awaitingResponseRef.current = false
    greetedRef.current = false
    greetingPlayingRef.current = false
    isiSpeakingRef.current = false
    lastUserTranscriptRef.current = ""
    toolsRef.current = []
    clearSessionToolData()
    window.clearTimeout(isiQuietTimerRef.current)
    window.clearTimeout(awaitingTimerRef.current)
    setHearingUser(false)
    setActivity(null)
    stopMicrophone(streamRef.current)
    streamRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.srcObject = null
    }
    releaseCallAudioSession()
    setLocalStream(null)
    setRemoteStream(null)
    setBusy(false)
  }, [])

  const closeTextSession = useCallback(() => {
    textGenerationRef.current += 1
    textConnectPromiseRef.current = null
    textOutboxRef.current = []
    textSeenCallIdsRef.current = new Set()
    textChannelRef.current = null
    if (textWsRef.current) {
      textWsRef.current.close()
      textWsRef.current = null
    }
    setTextStatus("idle")
  }, [])

  const hangUp = useCallback(() => {
    generationRef.current += 1
    pendingTextRef.current = ""
    skipGreetingRef.current = false
    closeTextSession()
    releaseCall()
    setVoiceStatus("idle")
  }, [closeTextSession, releaseCall, setVoiceStatus])

  const buildToolHandlers = useCallback(
    () => ({
      onHangUp: hangUp,
      onToolStart: (name: string) => {
        toolsInFlightRef.current += 1
        if (TOOL_ACTIVITY.has(name)) {
          toolsRef.current = [...toolsRef.current, name]
          syncActivity()
        }
        syncBusy()
      },
      onToolEnd: (name: string) => {
        toolsInFlightRef.current = Math.max(0, toolsInFlightRef.current - 1)
        if (TOOL_ACTIVITY.has(name)) {
          const index = toolsRef.current.lastIndexOf(name)
          if (index >= 0) {
            toolsRef.current = [
              ...toolsRef.current.slice(0, index),
              ...toolsRef.current.slice(index + 1),
            ]
          }
          syncActivity()
        }
        syncBusy()
      },
      onAwaitingResponse: () => {
        awaitingResponseRef.current = true
        syncBusy()
        window.clearTimeout(awaitingTimerRef.current)
        awaitingTimerRef.current = window.setTimeout(() => {
          if (!awaitingResponseRef.current) {
            return
          }
          awaitingResponseRef.current = false
          syncBusy()
          logIsi("timeout esperando respuesta tras tool")
        }, 45_000)
      },
      shouldEndCall: () => {
        if (greetingPlayingRef.current || isiSpeakingRef.current) {
          return false
        }
        const last = lastUserTranscriptRef.current
        if (!isHangupCommand(last)) {
          return false
        }
        return true
      },
      onReportGenerated: (report: { url: string; fileName: string; title: string }) => {
        appendPdfReportRef.current(report)
      },
      onStructuredChat: (markdown: string) => {
        appendMarkdownMessageRef.current(markdown)
      },
    }),
    [hangUp, syncActivity, syncBusy],
  )

  const sendUserTextOnChannel = useCallback((channel: RealtimeChannel, text: string) => {
    if (channel.readyState !== "open") {
      return false
    }
    chatController.current.beginPendingAssistantReply()
    channel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      }),
    )
    channel.send(JSON.stringify({ type: "response.create" }))
    awaitingResponseRef.current = true
    syncBusy()
    return true
  }, [chatController, syncBusy])

  const sendUserText = useCallback(
    (text: string) => {
      const voiceChannel = channelRef.current
      if (voiceChannel && voiceChannel.readyState === "open") {
        return sendUserTextOnChannel(voiceChannel, text)
      }
      const textChannel = textChannelRef.current
      if (textChannel) {
        return sendUserTextOnChannel(textChannel, text)
      }
      return false
    },
    [sendUserTextOnChannel],
  )

  const flushTextOutbox = useCallback(() => {
    const channel = textChannelRef.current
    if (!channel || channel.readyState !== "open") {
      return
    }
    while (textOutboxRef.current.length > 0) {
      const next = textOutboxRef.current.shift()
      if (next) {
        sendUserTextOnChannel(channel, next)
      }
    }
  }, [sendUserTextOnChannel])

  const ensureTextSession = useCallback(async () => {
    if (textChannelRef.current?.readyState === "open") {
      return
    }
    if (textConnectPromiseRef.current) {
      await textConnectPromiseRef.current
      return
    }

    const generation = textGenerationRef.current + 1
    textGenerationRef.current = generation
    setTextStatus("connecting")
    setError(null)

    textConnectPromiseRef.current = (async () => {
      try {
        const session = await api<{ clientSecret: string; model: string }>("/realtime/text-session", {
          method: "POST",
        })
        if (generation !== textGenerationRef.current) {
          return
        }

        const ws = new WebSocket(
          `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`,
          ["realtime", `openai-insecure-api-key.${session.clientSecret}`],
        )
        textWsRef.current = ws
        const channel = channelFromWebSocket(ws)
        textChannelRef.current = channel
        textSeenCallIdsRef.current = new Set()

        await new Promise<void>((resolve, reject) => {
          const fail = (message: string) => {
            if (generation !== textGenerationRef.current) {
              return
            }
            reject(new Error(message))
          }

          ws.addEventListener(
            "open",
            () => {
              if (generation !== textGenerationRef.current) {
                return
              }
              channel.send(
                JSON.stringify({
                  type: "session.update",
                  session: {
                    type: "realtime",
                    output_modalities: ["text"],
                  },
                }),
              )
              setTextStatus("ready")
              flushTextOutbox()
              resolve()
            },
            { once: true },
          )

          ws.addEventListener(
            "error",
            () => {
              fail("No se pudo conectar el chat de texto")
            },
            { once: true },
          )

          ws.addEventListener(
            "close",
            () => {
              if (generation !== textGenerationRef.current) {
                return
              }
              textChannelRef.current = null
              textWsRef.current = null
              setTextStatus("idle")
            },
            { once: true },
          )
        })

        ws.addEventListener("message", (message) => {
          if (generation !== textGenerationRef.current) {
            return
          }
          let event: unknown
          try {
            event = JSON.parse(message.data as string)
          } catch {
            return
          }
          const record = event as Record<string, unknown>
          handleRealtimeServerEvent(record, {
            chat: chatController.current,
            channel,
            seenCallIds: textSeenCallIdsRef.current,
            toolHandlers: buildToolHandlers(),
            onResponseCreated: (responseId) => {
              awaitingResponseRef.current = false
              responseOpenRef.current += 1
              syncBusy()
              chatController.current.beginAssistantResponse(responseId)
            },
            onResponseDone: () => {
              awaitingResponseRef.current = false
              responseOpenRef.current = Math.max(0, responseOpenRef.current - 1)
              syncBusy()
            },
          })
        })
      } catch (err) {
        if (generation !== textGenerationRef.current) {
          return
        }
        closeTextSession()
        setError(err instanceof Error ? err.message : "No se pudo abrir el chat de texto")
        throw err
      } finally {
        if (generation === textGenerationRef.current) {
          textConnectPromiseRef.current = null
        }
      }
    })()

    await textConnectPromiseRef.current
  }, [buildToolHandlers, chatController, closeTextSession, flushTextOutbox, syncBusy])

  const flushPendingText = useCallback(() => {
    const text = pendingTextRef.current.trim()
    if (!text) {
      return
    }
    pendingTextRef.current = ""
    if (!sendUserText(text)) {
      pendingTextRef.current = text
    }
  }, [sendUserText])

  const start = useCallback(async (voice: RealtimeVoice, options?: { skipGreeting?: boolean }) => {
    closeTextSession()
    const generation = generationRef.current + 1
    generationRef.current = generation
    startVoiceRef.current = voice
    skipGreetingRef.current = options?.skipGreeting ?? Boolean(pendingTextRef.current.trim())
    peerRef.current?.close()
    peerRef.current = null
    channelRef.current = null
    streamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    setError(null)
    resetMessages()
    setVoiceStatus("connecting")

    try {
      const micStream = await captureMicrophone()
      if (generation !== generationRef.current) {
        return
      }
      streamRef.current = micStream
      setLocalStream(micStream)

      const peer = new RTCPeerConnection()
      peerRef.current = peer
      micStream.getAudioTracks().forEach((track) => {
        peer.addTrack(track, micStream)
      })

      let greetingInstruction = ""
      const greetChannelRef = { current: null as RTCDataChannel | null }
      let remoteReady = false
      let greetingResponseOpen = false
      let greetingWatchdog = 0
      let greetingRetryUsed = false
      let userTurnFallbackTimer = 0

      const setListening = (createResponse: boolean, channel: RTCDataChannel | null) => {
        if (channel?.readyState === "open") {
          channel.send(
            JSON.stringify({
              type: "session.update",
              session: {
                audio: {
                  input: {
                    turn_detection: {
                      type: "semantic_vad",
                      eagerness: "low",
                      interrupt_response: true,
                      create_response: createResponse,
                    },
                  },
                },
              },
            }),
          )
        }
      }

      const finishGreeting = () => {
        if (!greetedRef.current) {
          return
        }
        greetingPlayingRef.current = false
        greetingResponseOpen = false
        logIsi("abrió el turno después del saludo")
        setListening(true, greetChannelRef.current ?? channelRef.current)
        flushPendingText()
        syncBusy()
      }

      const attemptConnectGreeting = () => {
        const channel = greetChannelRef.current
        if (greetedRef.current || !channel || channel.readyState !== "open") {
          return
        }
        if (skipGreetingRef.current) {
          greetedRef.current = true
          greetingPlayingRef.current = false
          logIsi("omitió el saludo: hay un mensaje del usuario")
          setListening(true, channel)
          flushPendingText()
          syncBusy()
          return
        }
        if (!greetingInstruction.trim()) {
          return
        }
        greetedRef.current = true
        greetingPlayingRef.current = true
        greetingResponseOpen = true
        syncBusy()
        logIsi("envió el saludo inicial")
        setListening(false, channel)
        sendConnectGreeting(channel, greetingInstruction)
        window.clearTimeout(greetingWatchdog)
        greetingWatchdog = window.setTimeout(() => {
          if (generation !== generationRef.current || !greetingPlayingRef.current) {
            return
          }
          if (greetingResponseOpen && !greetingRetryUsed) {
            greetingRetryUsed = true
            logIsi("reintentando saludo: no hubo audio de respuesta")
            greetedRef.current = false
            greetingResponseOpen = false
            greetingPlayingRef.current = false
            syncBusy()
            attemptConnectGreeting()
            return
          }
          finishGreeting()
        }, 12_000)
      }

      peer.ontrack = (event) => {
        if (event.track.kind !== "audio" || remoteReady) {
          return
        }
        remoteReady = true
        const remote = event.streams[0] ?? new MediaStream([event.track])
        setRemoteStream(remote)
        const audio = audioRef.current
        if (audio) {
          setAudioSessionType("play-and-record")
          audio.setAttribute("playsinline", "true")
          audio.setAttribute("webkit-playsinline", "true")
          audio.muted = false
          audio.srcObject = remote
          void audio.play().catch(() => {})
        }
        attemptConnectGreeting()
      }

      const attachChannel = (channel: RTCDataChannel, canGreet: boolean) => {
        if (!channelRef.current) {
          channelRef.current = channel
        }
        const primeSession = () => {
          if (channel.readyState !== "open") {
            return
          }
          channel.send(
            JSON.stringify({
              type: "session.update",
              session: {
                audio: {
                  input: {
                    transcription: {
                      model: "whisper-1",
                    },
                    turn_detection: {
                      type: "semantic_vad",
                      eagerness: "low",
                      interrupt_response: true,
                      create_response: false,
                    },
                  },
                },
              },
            }),
          )
        }
        if (canGreet) {
          greetChannelRef.current = channel
          if (channel.readyState === "open") {
            primeSession()
            attemptConnectGreeting()
          } else {
            channel.addEventListener(
              "open",
              () => {
                primeSession()
                attemptConnectGreeting()
              },
              { once: true },
            )
          }
        }
        channel.addEventListener("message", (message) => {
          let event: unknown
          try {
            event = JSON.parse(message.data as string)
          } catch {
            return
          }
          const type = (event as { type?: string }).type
          if (typeof type !== "string") {
            return
          }
          if (type === "input_audio_buffer.speech_started") {
            setHearingUser(true)
            // Nuevo turno del usuario: no arrastrar un “saltar voz” de la consulta anterior.
            clearVoiceSkipRef.current()
          }
          if (type === "input_audio_buffer.speech_stopped") {
            setHearingUser(false)
          }
          if (
            type.includes("output_audio") &&
            (type.includes("delta") || type.includes("started"))
          ) {
            window.clearTimeout(isiQuietTimerRef.current)
            if (!isiSpeakingRef.current) {
              isiSpeakingRef.current = true
              syncBusy()
            }
          }
          if (
            type === "output_audio_buffer.stopped" ||
            type === "output_audio_buffer.cleared" ||
            type === "response.output_audio.done"
          ) {
            window.clearTimeout(isiQuietTimerRef.current)
            isiQuietTimerRef.current = window.setTimeout(() => {
              isiSpeakingRef.current = false
              syncBusy()
            }, 1200)
          }
          const record = event as Record<string, unknown>
          if (type.includes("input_audio_transcription.completed")) {
            const heard = nestedTranscript(record) || assistantHeardBuffer
            if (heard) {
              lastUserTranscriptRef.current = heard
              appendUserMessageRef.current(heard)
            }
            if (greetedRef.current && !greetingPlayingRef.current) {
              window.clearTimeout(userTurnFallbackTimer)
              userTurnFallbackTimer = window.setTimeout(() => {
                if (generation !== generationRef.current) {
                  return
                }
                if (
                  responseOpenRef.current > 0 ||
                  awaitingResponseRef.current ||
                  toolsInFlightRef.current > 0 ||
                  greetingPlayingRef.current
                ) {
                  return
                }
                if (channel.readyState !== "open") {
                  return
                }
                logIsi("fallback: creando respuesta tras turno del usuario")
                setListening(true, channel)
                channel.send(JSON.stringify({ type: "response.create" }))
              }, 900)
            }
          }
          if (type === "response.created") {
            window.clearTimeout(userTurnFallbackTimer)
            window.clearTimeout(awaitingTimerRef.current)
            awaitingResponseRef.current = false
            responseOpenRef.current += 1
            syncBusy()
            chatController.current.beginAssistantResponse(responseIdFrom(record))
          }
          if (type === "response.done") {
            window.clearTimeout(awaitingTimerRef.current)
            awaitingResponseRef.current = false
            responseOpenRef.current = Math.max(0, responseOpenRef.current - 1)
            window.clearTimeout(isiQuietTimerRef.current)
            isiQuietTimerRef.current = window.setTimeout(() => {
              isiSpeakingRef.current = false
              syncBusy()
            }, 1500)
            syncBusy()
            if (greetingResponseOpen) {
              greetingResponseOpen = false
              window.clearTimeout(greetingWatchdog)
              window.setTimeout(() => {
                if (generation !== generationRef.current) {
                  return
                }
                finishGreeting()
              }, 400)
            }
          }
          handleAssistantChatEvent(record, chatController.current)
          logAssistantHearing(record)
          void handleRealtimeToolEvent(
            channel,
            event as Parameters<typeof handleRealtimeToolEvent>[1],
            seenCallIdsRef.current,
            {
              onHangUp: hangUp,
              onToolStart: (name) => {
                toolsInFlightRef.current += 1
                if (TOOL_ACTIVITY.has(name)) {
                  toolsRef.current = [...toolsRef.current, name]
                  syncActivity()
                }
                syncBusy()
              },
              onToolEnd: (name) => {
                toolsInFlightRef.current = Math.max(0, toolsInFlightRef.current - 1)
                if (TOOL_ACTIVITY.has(name)) {
                  const index = toolsRef.current.lastIndexOf(name)
                  if (index >= 0) {
                    toolsRef.current = [
                      ...toolsRef.current.slice(0, index),
                      ...toolsRef.current.slice(index + 1),
                    ]
                  }
                  syncActivity()
                }
                syncBusy()
              },
              onAwaitingResponse: () => {
                awaitingResponseRef.current = true
                syncBusy()
                window.clearTimeout(awaitingTimerRef.current)
                awaitingTimerRef.current = window.setTimeout(() => {
                  if (!awaitingResponseRef.current) {
                    return
                  }
                  awaitingResponseRef.current = false
                  syncBusy()
                  logIsi("timeout esperando respuesta tras tool")
                }, 45_000)
              },
              shouldEndCall: () => {
                if (greetingPlayingRef.current || isiSpeakingRef.current) {
                  logIsi("ignoró end_call: Isi aún hablaba")
                  return false
                }
                const last = lastUserTranscriptRef.current
                if (!isHangupCommand(last)) {
                  logIsi("ignoró end_call: no hubo despedida", last || "(vacío)")
                  return false
                }
                return true
              },
              onReportGenerated: (report) => {
                appendPdfReportRef.current(report)
              },
              onStructuredChat: (markdown) => {
                appendMarkdownMessageRef.current(markdown)
              },
            },
          )
        })
      }

      peer.ondatachannel = (event) => {
        attachChannel(event.channel, false)
      }
      attachChannel(peer.createDataChannel("oai-events"), true)

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await waitForIce(peer)

      const localSdp = peer.localDescription?.sdp
      if (!localSdp) {
        throw new Error("No se pudo crear la oferta WebRTC")
      }

      const session = await api<{ sdp: string; userName?: string; greetingInstruction?: string }>(
        "/realtime/session",
        {
          method: "POST",
          body: JSON.stringify({ sdp: localSdp, voice }),
        },
      )

      if (generation !== generationRef.current) {
        return
      }

      greetingInstruction =
        session.greetingInstruction?.trim() ||
        buildConnectGreeting(session.userName?.trim() || "ahí")

      await peer.setRemoteDescription({ type: "answer", sdp: session.sdp })
      attemptConnectGreeting()
      setVoiceStatus("live")
      flushPendingText()
    } catch (err) {
      if (generation !== generationRef.current) {
        return
      }
      hangUp()
      setVoiceStatus("error")
      setError(describeMicError(err))
    }
  }, [
    chatController,
    closeTextSession,
    flushPendingText,
    hangUp,
    releaseCall,
    resetMessages,
    setVoiceStatus,
    syncActivity,
    syncBusy,
  ])

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) {
        return
      }
      appendUserMessageRef.current(trimmed)

      if (statusRef.current === "live") {
        if (!sendUserText(trimmed)) {
          pendingTextRef.current = trimmed
        }
        return
      }
      if (statusRef.current === "connecting") {
        pendingTextRef.current = trimmed
        return
      }

      try {
        await ensureTextSession()
        const channel = textChannelRef.current
        if (channel?.readyState === "open") {
          sendUserTextOnChannel(channel, trimmed)
        } else {
          textOutboxRef.current.push(trimmed)
        }
      } catch {
        // error ya en setError
      }
    },
    [ensureTextSession, sendUserText, sendUserTextOnChannel],
  )

  useEffect(() => {
    return () => {
      hangUp()
    }
  }, [hangUp])

  return {
    status,
    textStatus,
    error,
    start,
    sendText,
    hangUp,
    audioRef,
    localStream,
    remoteStream,
    busy,
    hearingUser,
    activity,
    messages,
  }
}
