import { useEffect, useState } from "react"
import { setAudioSessionType } from "@/audio/audioSession"

export const useAudioLevel = (stream: MediaStream | null) => {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0)
      return
    }

    let audioContext: AudioContext
    try {
      audioContext = new AudioContext()
    } catch {
      setLevel(0)
      return
    }

    let source: MediaStreamAudioSourceNode
    try {
      source = audioContext.createMediaStreamSource(stream)
    } catch {
      void audioContext.close()
      setLevel(0)
      return
    }
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.65
    source.connect(analyser)

    const timeDomain = new Uint8Array(analyser.fftSize)
    const frequencies = new Uint8Array(analyser.frequencyBinCount)
    let frame = 0
    let envelope = 0
    let lastTime = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      analyser.getByteTimeDomainData(timeDomain)
      let sum = 0
      for (const sample of timeDomain) {
        const value = (sample - 128) / 128
        sum += value * value
      }
      const rms = Math.sqrt(sum / timeDomain.length)

      analyser.getByteFrequencyData(frequencies)
      let freqSum = 0
      const speechStart = 2
      const speechEnd = Math.min(frequencies.length, 48)
      for (let i = speechStart; i < speechEnd; i += 1) {
        freqSum += frequencies[i] ?? 0
      }
      const speech = freqSum / ((speechEnd - speechStart) * 255)

      const raw = Math.min(1, Math.max(rms * 14, speech * 2.4))
      const tau = raw > envelope ? 0.11 : 0.38
      envelope += (raw - envelope) * (1 - Math.exp(-dt / tau))
      setLevel(envelope)

      frame = requestAnimationFrame(tick)
    }

    void audioContext.resume().then(() => {
      setAudioSessionType("play-and-record")
    })
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      source.disconnect()
      void audioContext.close()
      setLevel(0)
    }
  }, [stream])

  return level
}
