import rnnoiseSimdUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url"
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url"
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url"
import speexWasmUrl from "@sapphi-red/web-noise-suppressor/speex.wasm?url"
import speexWorkletUrl from "@sapphi-red/web-noise-suppressor/speexWorklet.js?url"
import { setAudioSessionType } from "./audioSession"
import aecWorkletUrl from "./aec-processor.js?url"

export type VoicePipeline = {
  stream: MediaStream
  setEchoReference: (remote: MediaStream | null) => void
  close: () => void
}

const workletsAvailable = () =>
  typeof AudioWorkletNode !== "undefined" &&
  typeof AudioContext !== "undefined" &&
  typeof AudioContext.prototype.audioWorklet !== "undefined"

const passthrough = (micStream: MediaStream): VoicePipeline => ({
  stream: micStream,
  setEchoReference: () => {},
  close: () => {},
})

const connectDenoise = async (context: AudioContext, input: AudioNode) => {
  const { loadRnnoise, loadSpeex, RnnoiseWorkletNode, SpeexWorkletNode } = await import(
    "@sapphi-red/web-noise-suppressor"
  )

  try {
    if (context.sampleRate === 48000) {
      const wasmBinary = await loadRnnoise({
        url: rnnoiseWasmUrl,
        simdUrl: rnnoiseSimdUrl,
      })
      await context.audioWorklet.addModule(rnnoiseWorkletUrl)
      const rnnoise = new RnnoiseWorkletNode(context, {
        maxChannels: 1,
        wasmBinary,
      })
      input.connect(rnnoise)
      return { node: rnnoise, destroy: () => rnnoise.destroy() }
    }
  } catch {
    // RNNoise no está disponible; se intenta Speex
  }

  try {
    const wasmBinary = await loadSpeex({ url: speexWasmUrl })
    await context.audioWorklet.addModule(speexWorkletUrl)
    const speex = new SpeexWorkletNode(context, {
      maxChannels: 1,
      wasmBinary,
    })
    input.connect(speex)
    return { node: speex, destroy: () => speex.destroy() }
  } catch {
    return { node: input, destroy: () => {} }
  }
}

const buildVoicePipeline = async (micStream: MediaStream): Promise<VoicePipeline> => {
  if (!workletsAvailable()) {
    return passthrough(micStream)
  }

  const context = new AudioContext({ latencyHint: "interactive" })
  await context.resume()
  setAudioSessionType("play-and-record")
  await context.audioWorklet.addModule(aecWorkletUrl)

  const micSource = context.createMediaStreamSource(micStream)
  const aec = new AudioWorkletNode(context, "echo-cancel", {
    numberOfInputs: 2,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
  })
  micSource.connect(aec, 0, 0)

  const denoise = await connectDenoise(context, aec)
  const destination = context.createMediaStreamDestination()
  denoise.node.connect(destination)

  let refSource: MediaStreamAudioSourceNode | null = null
  let refClone: MediaStream | null = null

  return {
    stream: destination.stream,
    setEchoReference: (remote) => {
      refSource?.disconnect()
      refClone?.getTracks().forEach((track) => track.stop())
      refSource = null
      refClone = null
      if (!remote || remote.getAudioTracks().length === 0) {
        return
      }
      refClone = remote.clone()
      refSource = context.createMediaStreamSource(refClone)
      refSource.connect(aec, 0, 1)
    },
    close: () => {
      refSource?.disconnect()
      refClone?.getTracks().forEach((track) => track.stop())
      micSource.disconnect()
      denoise.destroy()
      aec.disconnect()
      void context.close()
    },
  }
}

export const createVoicePipeline = async (micStream: MediaStream): Promise<VoicePipeline> => {
  try {
    return await buildVoicePipeline(micStream)
  } catch {
    return passthrough(micStream)
  }
}
