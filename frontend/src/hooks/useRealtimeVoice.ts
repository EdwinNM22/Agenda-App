import { useCallback, useEffect, useRef, useState } from "react"
import { createVoicePipeline, type VoicePipeline } from "@/audio/voicePipeline"
import { api } from "@/lib/api"
import { handleRealtimeToolEvent } from "@/lib/realtimeTools"
import type { RealtimeVoice } from "@/lib/voices"

export type VoiceStatus = "idle" | "connecting" | "live" | "error"

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
  const pipelineRef = useRef<VoicePipeline | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const seenCallIdsRef = useRef<Set<string>>(new Set())
  const generationRef = useRef(0)
  const responseOpenRef = useRef(0)
  const toolsInFlightRef = useRef(0)
  const awaitingResponseRef = useRef(false)
  const [busy, setBusy] = useState(false)

  const syncBusy = useCallback(() => {
    const next =
      responseOpenRef.current > 0 ||
      toolsInFlightRef.current > 0 ||
      awaitingResponseRef.current
    setBusy((prev) => (prev === next ? prev : next))
  }, [])

  const hangUp = useCallback(() => {
    generationRef.current += 1
    pipelineRef.current?.close()
    pipelineRef.current = null
    peerRef.current?.close()
    peerRef.current = null
    channelRef.current = null
    seenCallIdsRef.current = new Set()
    responseOpenRef.current = 0
    toolsInFlightRef.current = 0
    awaitingResponseRef.current = false
    stopStream(streamRef.current)
    streamRef.current = null
    if (audioRef.current) {
      audioRef.current.srcObject = null
    }
    setLocalStream(null)
    setRemoteStream(null)
    setBusy(false)
    setStatus("idle")
  }, [])

  const start = useCallback(async (voice: RealtimeVoice, _userName?: string) => {
    hangUp()
    const generation = generationRef.current
    setError(null)
    setStatus("connecting")

    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      })
      if (generation !== generationRef.current) {
        stopStream(rawStream)
        return
      }
      streamRef.current = rawStream

      const pipeline = await createVoicePipeline(rawStream)
      if (generation !== generationRef.current) {
        pipeline.close()
        stopStream(rawStream)
        return
      }
      pipelineRef.current = pipeline
      setLocalStream(pipeline.stream)

      const peer = new RTCPeerConnection()
      peerRef.current = peer
      pipeline.stream.getTracks().forEach((track) => peer.addTrack(track, pipeline.stream))

      peer.ontrack = (event) => {
        const remote = event.streams[0] ?? new MediaStream([event.track])
        setRemoteStream(remote)
        pipelineRef.current?.setEchoReference(remote)
        const audio = audioRef.current
        if (audio) {
          audio.srcObject = remote
          audio.setAttribute("playsinline", "true")
          audio.muted = false
          void audio.play().catch(() => {})
        }
      }

      const attachChannel = (channel: RTCDataChannel) => {
        if (!channelRef.current) {
          channelRef.current = channel
        }
        channel.addEventListener("message", (message) => {
          let event: unknown
          try {
            event = JSON.parse(message.data as string)
          } catch {
            return
          }
          const type = (event as { type?: string }).type
          if (type === "response.created") {
            awaitingResponseRef.current = false
            responseOpenRef.current += 1
            syncBusy()
          }
          if (type === "response.done") {
            awaitingResponseRef.current = false
            responseOpenRef.current = Math.max(0, responseOpenRef.current - 1)
            syncBusy()
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
            },
          )
        })
      }

      peer.ondatachannel = (event) => {
        attachChannel(event.channel)
      }
      attachChannel(peer.createDataChannel("oai-events"))

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
      setError(err instanceof Error ? err.message : "No se pudo iniciar la conversación")
    }
  }, [hangUp, syncBusy])

  useEffect(() => {
    return () => {
      hangUp()
    }
  }, [hangUp])

  return { status, error, start, hangUp, audioRef, localStream, remoteStream, busy }
}
