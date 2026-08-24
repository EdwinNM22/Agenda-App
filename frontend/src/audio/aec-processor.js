const FFT_SIZE = 1024
const HOP_SIZE = 512
const BINS = FFT_SIZE / 2

const makeHann = () => {
  const window = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1))
  }
  return window
}

const bitReverse = (value, bits) => {
  let reversed = 0
  for (let i = 0; i < bits; i += 1) {
    reversed = (reversed << 1) | (value & 1)
    value >>= 1
  }
  return reversed
}

const fft = (real, imag, inverse) => {
  const n = real.length
  const bits = Math.log2(n)
  for (let i = 0; i < n; i += 1) {
    const j = bitReverse(i, bits)
    if (i < j) {
      const tr = real[i]
      real[i] = real[j]
      real[j] = tr
      const ti = imag[i]
      imag[i] = imag[j]
      imag[j] = ti
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size
    const stepReal = Math.cos(angle)
    const stepImag = Math.sin(angle)
    for (let i = 0; i < n; i += size) {
      let wReal = 1
      let wImag = 0
      const half = size >> 1
      for (let j = 0; j < half; j += 1) {
        const even = i + j
        const odd = even + half
        const tReal = real[odd] * wReal - imag[odd] * wImag
        const tImag = real[odd] * wImag + imag[odd] * wReal
        real[odd] = real[even] - tReal
        imag[odd] = imag[even] - tImag
        real[even] += tReal
        imag[even] += tImag
        const nextReal = wReal * stepReal - wImag * stepImag
        wImag = wReal * stepImag + wImag * stepReal
        wReal = nextReal
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i += 1) {
      real[i] /= n
      imag[i] /= n
    }
  }
}

class EchoCancelProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.window = makeHann()
    this.micFifo = new Float32Array(FFT_SIZE * 2)
    this.refFifo = new Float32Array(FFT_SIZE * 2)
    this.outFifo = new Float32Array(FFT_SIZE * 2)
    this.micLen = 0
    this.refLen = 0
    this.outLen = 0
    this.prevOverlap = new Float32Array(HOP_SIZE)
    this.Hreal = new Float32Array(BINS + 1)
    this.Himag = new Float32Array(BINS + 1)
    this.micReal = new Float32Array(FFT_SIZE)
    this.micImag = new Float32Array(FFT_SIZE)
    this.refReal = new Float32Array(FFT_SIZE)
    this.refImag = new Float32Array(FFT_SIZE)
    this.dcX = 0
    this.dcY = 0
  }

  highpass(sample) {
    const next = sample - this.dcX + 0.995 * this.dcY
    this.dcX = sample
    this.dcY = next
    return next
  }

  processHop() {
    this.micReal.fill(0)
    this.micImag.fill(0)
    this.refReal.fill(0)
    this.refImag.fill(0)

    for (let i = 0; i < FFT_SIZE; i += 1) {
      this.micReal[i] = this.micFifo[i] * this.window[i]
      this.refReal[i] = this.refFifo[i] * this.window[i]
    }

    fft(this.micReal, this.micImag, false)
    fft(this.refReal, this.refImag, false)

    let micPow = 0
    let refPow = 0
    let echoPow = 0
    let errPow = 0

    for (let k = 0; k <= BINS; k += 1) {
      const xRe = this.refReal[k]
      const xIm = this.refImag[k]
      const yRe = this.micReal[k]
      const yIm = this.micImag[k]
      const eRe = this.Hreal[k] * xRe - this.Himag[k] * xIm
      const eIm = this.Hreal[k] * xIm + this.Himag[k] * xRe
      const vRe = yRe - eRe
      const vIm = yIm - eIm
      micPow += yRe * yRe + yIm * yIm
      refPow += xRe * xRe + xIm * xIm
      echoPow += eRe * eRe + eIm * eIm
      errPow += vRe * vRe + vIm * vIm
    }

    const doubleTalk = micPow > 2.2 * (echoPow + 1e-8) && errPow > 0.35 * micPow
    const refActive = refPow > 1e-5

    if (refActive && !doubleTalk) {
      for (let k = 0; k <= BINS; k += 1) {
        const xRe = this.refReal[k]
        const xIm = this.refImag[k]
        const yRe = this.micReal[k]
        const yIm = this.micImag[k]
        const eRe = this.Hreal[k] * xRe - this.Himag[k] * xIm
        const eIm = this.Hreal[k] * xIm + this.Himag[k] * xRe
        const vRe = yRe - eRe
        const vIm = yIm - eIm
        const xPow = xRe * xRe + xIm * xIm + 1e-6
        const mu = 0.25 / xPow
        this.Hreal[k] = this.Hreal[k] * 0.9995 + mu * (vRe * xRe + vIm * xIm)
        this.Himag[k] = this.Himag[k] * 0.9995 + mu * (vIm * xRe - vRe * xIm)
      }
    } else if (!refActive) {
      for (let k = 0; k <= BINS; k += 1) {
        this.Hreal[k] *= 0.998
        this.Himag[k] *= 0.998
      }
    }

    for (let k = 0; k <= BINS; k += 1) {
      const xRe = this.refReal[k]
      const xIm = this.refImag[k]
      const yRe = this.micReal[k]
      const yIm = this.micImag[k]
      const eRe = this.Hreal[k] * xRe - this.Himag[k] * xIm
      const eIm = this.Hreal[k] * xIm + this.Himag[k] * xRe
      let vRe = yRe - eRe
      let vIm = yIm - eIm
      const echoMag = Math.hypot(eRe, eIm)
      const errMag = Math.hypot(vRe, vIm)
      const wiener = errMag / (errMag + echoMag + 1e-8)
      const gain = Math.max(doubleTalk ? 0.35 : 0.12, wiener)
      this.micReal[k] = vRe * gain
      this.micImag[k] = vIm * gain
    }

    for (let k = 1; k < BINS; k += 1) {
      this.micReal[FFT_SIZE - k] = this.micReal[k]
      this.micImag[FFT_SIZE - k] = -this.micImag[k]
    }

    fft(this.micReal, this.micImag, true)

    for (let i = 0; i < HOP_SIZE; i += 1) {
      this.outFifo[this.outLen + i] = this.prevOverlap[i] + this.micReal[i] * this.window[i]
      this.prevOverlap[i] = this.micReal[i + HOP_SIZE] * this.window[i + HOP_SIZE]
    }
    this.outLen += HOP_SIZE

    this.micFifo.copyWithin(0, HOP_SIZE, this.micLen)
    this.refFifo.copyWithin(0, HOP_SIZE, this.refLen)
    this.micLen -= HOP_SIZE
    this.refLen -= HOP_SIZE
  }

  process(inputs, outputs) {
    const mic = inputs[0]?.[0]
    const ref = inputs[1]?.[0]
    const output = outputs[0]?.[0]
    if (!mic || !output) {
      return true
    }

    for (let i = 0; i < mic.length; i += 1) {
      this.micFifo[this.micLen + i] = this.highpass(mic[i])
      this.refFifo[this.refLen + i] = ref ? ref[i] : 0
    }
    this.micLen += mic.length
    this.refLen += mic.length

    while (this.micLen >= FFT_SIZE && this.refLen >= FFT_SIZE) {
      this.processHop()
    }

    if (this.outLen < output.length) {
      output.fill(0)
      return true
    }

    output.set(this.outFifo.subarray(0, output.length))
    this.outFifo.copyWithin(0, output.length, this.outLen)
    this.outLen -= output.length
    return true
  }
}

registerProcessor("echo-cancel", EchoCancelProcessor)
