import { useCallback, useEffect, useRef, useState } from "react"
import {
  captureMicrophone,
  describeMicError,
  releaseCallAudioSession,
  setAudioSessionType,
} from "@/audio/audioSession"
import { api } from "@/lib/api"
import { handleRealtimeToolEvent } from "@/lib/realtimeTools"
import { isHangupCommand } from "@/lib/voiceCommands"
import type { RealtimeVoice } from "@/lib/voices"

export type VoiceStatus = "idle" | "connecting" | "live" | "error"

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
    assistantSaidBuffer = ""
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

const stopStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop())
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
  const [busy, setBusy] = useState(false)
  const [hearingUser, setHearingUser] = useState(false)

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
    window.clearTimeout(isiQuietTimerRef.current)
    setHearingUser(false)
    stopStream(streamRef.current)
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

  const hangUp = useCallback(() => {
    generationRef.current += 1
    releaseCall()
    setStatus("idle")
  }, [releaseCall])

  const start = useCallback(async (voice: RealtimeVoice, userName?: string) => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    peerRef.current?.close()
    peerRef.current = null
    channelRef.current = null
    stopStream(streamRef.current)
    streamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    setError(null)
    setStatus("connecting")

    try {
      const micStream = await captureMicrophone()
      if (generation !== generationRef.current) {
        stopStream(micStream)
        return
      }
      streamRef.current = micStream
      setLocalStream(micStream)

      const peer = new RTCPeerConnection()
      peerRef.current = peer
      micStream.getAudioTracks().forEach((track) => {
        peer.addTrack(track, micStream)
      })

      const greetName = userName?.trim() || "ahí"
      const greetChannelRef = { current: null as RTCDataChannel | null }
      let remoteReady = false
      let greetingResponseOpen = false

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
        if (!greetingPlayingRef.current) {
          return
        }
        greetingPlayingRef.current = false
        logIsi("abrió el turno después del saludo")
        setListening(true, greetChannelRef.current)
        syncBusy()
      }

      const tryGreet = () => {
        const channel = greetChannelRef.current
        if (greetedRef.current || !remoteReady || !channel || channel.readyState !== "open") {
          return
        }
        greetedRef.current = true
        greetingPlayingRef.current = true
        greetingResponseOpen = true
        syncBusy()
        logIsi("envió el saludo inicial")
        setListening(false, channel)
        channel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions: `Acaba de empezar la llamada. Saluda a ${greetName} en una sola frase, cercana y breve. Preséntate como Isi. No listes funciones ni preguntes qué puede hacer. No sigas hablando después. Espera en silencio a que te hablen.`,
            },
          }),
        )
        window.setTimeout(() => {
          if (generation !== generationRef.current) {
            return
          }
          finishGreeting()
        }, 10000)
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
        window.setTimeout(() => {
          if (generation !== generationRef.current) {
            return
          }
          tryGreet()
        }, 280)
      }

      const attachChannel = (channel: RTCDataChannel, canGreet: boolean) => {
        if (!channelRef.current) {
          channelRef.current = channel
        }
        const enableTranscription = () => {
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
                      language: "es",
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
            enableTranscription()
            tryGreet()
          } else {
            channel.addEventListener(
              "open",
              () => {
                enableTranscription()
                tryGreet()
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
          logAssistantHearing(event as Record<string, unknown>)
          if (type.includes("input_audio_transcription.completed")) {
            const heard = nestedTranscript(event as Record<string, unknown>) || assistantHeardBuffer
            if (heard) {
              lastUserTranscriptRef.current = heard
            }
          }
          if (type === "response.created") {
            awaitingResponseRef.current = false
            responseOpenRef.current += 1
            syncBusy()
          }
          if (type === "response.done") {
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
              window.setTimeout(() => {
                if (generation !== generationRef.current) {
                  return
                }
                finishGreeting()
              }, 1800)
            }
          }
          void handleRealtimeToolEvent(
            channel,
            event as Parameters<typeof handleRealtimeToolEvent>[1],
            seenCallIdsRef.current,
            {
              onHangUp: hangUp,
              onToolStart: () => {
                toolsInFlightRef.current += 1
                syncBusy()
              },
              onToolEnd: () => {
                toolsInFlightRef.current = Math.max(0, toolsInFlightRef.current - 1)
                syncBusy()
              },
              onAwaitingResponse: () => {
                awaitingResponseRef.current = true
                syncBusy()
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

      const session = await api<{ sdp: string }>("/realtime/session", {
        method: "POST",
        body: JSON.stringify({ sdp: localSdp, voice }),
      })

      if (generation !== generationRef.current) {
        return
      }

      await peer.setRemoteDescription({ type: "answer", sdp: session.sdp })
      setStatus("live")
    } catch (err) {
      if (generation !== generationRef.current) {
        return
      }
      hangUp()
      setStatus("error")
      setError(describeMicError(err))
    }
  }, [hangUp, releaseCall, syncBusy])

  useEffect(() => {
    return () => {
      hangUp()
    }
  }, [hangUp])

  return { status, error, start, hangUp, audioRef, localStream, remoteStream, busy, hearingUser }
}
