Integrate the "Particles Orb" animated AI-assistant orb into my React / Next.js (App Router) project.

No extra dependencies are required.

Create these shared utilities once (path: src/registry/lib):

lib/orb-state.ts
```ts
import type { CSSProperties, Ref, RefObject } from 'react';

export type OrbState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'
  | 'disabled';

export const ORB_STATES = [
  'idle',
  'connecting',
  'listening',
  'thinking',
  'speaking',
] as const satisfies readonly OrbState[];

export interface OrbProps {
  state?: OrbState;
  size?: number;
  speed?: number;
  colorFrom?: string;
  colorTo?: string;
  levelRef?: RefObject<number>;
  label?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export const ERROR_COLOR_FROM = '#fb7185';
export const ERROR_COLOR_TO = '#f43f5e';

export const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export type OrbMotion = 'ripple' | 'pulse' | 'flow' | 'none';

export const stateMotion = (state: OrbState): OrbMotion => {
  switch (state) {
    case 'listening':
      return 'ripple';
    case 'thinking':
      return 'pulse';
    case 'speaking':
      return 'flow';
    default:
      return 'none';
  }
};

export const stateEnergy = (state: OrbState, t: number): number => {
  switch (state) {
    case 'listening':
      return 0.4 + 0.32 * Math.abs(Math.sin(t * 8.5)) + 0.18 * Math.abs(Math.sin(t * 4.1 + 1.5));
    case 'speaking':
      return 0.3 + 0.24 * Math.abs(Math.sin(t * 6.2)) + 0.16 * Math.abs(Math.sin(t * 3 + 0.6));
    case 'thinking':
      return 0.24 + 0.2 * Math.abs(Math.sin(t * 2.4));
    case 'connecting':
      return 0.12 + 0.1 * Math.abs(Math.sin(t * 1.6));
    case 'error':
      return 0.2;
    default:
      return 0;
  }
};

export const approach = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export type StateWeights = Record<OrbState, number>;

export interface StateMix {
  weights: StateWeights;
  update: (state: OrbState, dt: number, rate?: number) => StateWeights;
}

export const createStateMix = (initial: OrbState = 'idle'): StateMix => {
  const weights: StateWeights = {
    idle: 0,
    connecting: 0,
    listening: 0,
    thinking: 0,
    speaking: 0,
    error: 0,
    disabled: 0,
  };
  weights[initial] = 1;
  const keys = Object.keys(weights) as OrbState[];
  const update = (state: OrbState, dt: number, rate = 6): StateWeights => {
    let total = 0;
    for (const key of keys) {
      const target = key === state ? 1 : 0;
      const next = approach(weights[key], target, rate, dt);
      weights[key] = target === 0 && next < 0.001 ? 0 : next;
      total += weights[key];
    }
    if (total > 0) {
      for (const key of keys) weights[key] /= total;
    }
    return weights;
  };
  return { weights, update };
};

export const orbVars = ({
  size,
  speed,
  colorFrom,
  colorTo,
}: Pick<OrbProps, 'size' | 'speed' | 'colorFrom' | 'colorTo'>): CSSProperties => {
  const vars: Record<string, string> = {};
  if (size != null) vars['--orb-size'] = `${size}px`;
  if (speed != null) vars['--orb-speed'] = `${speed}`;
  if (colorFrom) vars['--orb-color-from'] = colorFrom;
  if (colorTo) vars['--orb-color-to'] = colorTo;
  return vars as CSSProperties;
};
```

lib/use-orb-level.ts
```ts
'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { approach, stateEnergy, type OrbState } from './orb-state';
import { observeActivity } from './use-in-view';

export interface OrbBandRefs {
  bassRef: RefObject<number>;
  midRef: RefObject<number>;
  trebleRef: RefObject<number>;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const useOrbLevel = (
  ref: RefObject<HTMLElement | null>,
  state: OrbState,
  levelRef?: RefObject<number>,
  bands?: OrbBandRefs,
) => {
  const smoothedRef = useRef(0);
  const clockRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--orb-level', '0');
      el.style.setProperty('--orb-bass', '0');
      el.style.setProperty('--orb-mid', '0');
      el.style.setProperty('--orb-treble', '0');
      return;
    }

    let raf = 0;
    let last: number | null = null;
    let active = true;

    const frame = (now: number) => {
      raf = 0;
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      clockRef.current += dt;
      const live = levelRef?.current;
      const hasLive = typeof live === 'number' && live >= 0;
      const target = hasLive ? live : stateEnergy(state, clockRef.current);
      smoothedRef.current = approach(smoothedRef.current, target, 7.7, dt);
      const level = smoothedRef.current;
      const t = clockRef.current;
      const liveBass = bands?.bassRef.current ?? -1;
      const liveMid = bands?.midRef.current ?? -1;
      const liveTreble = bands?.trebleRef.current ?? -1;
      const bass = liveBass >= 0 ? liveBass : clamp01(level * (0.78 + 0.22 * Math.sin(t * 2.3)));
      const mid = liveMid >= 0 ? liveMid : clamp01(level * (0.78 + 0.22 * Math.sin(t * 3.4 + 2.1)));
      const treble =
        liveTreble >= 0 ? liveTreble : clamp01(level * (0.78 + 0.22 * Math.sin(t * 4.6 + 4.2)));
      el.style.setProperty('--orb-level', level.toFixed(3));
      el.style.setProperty('--orb-bass', bass.toFixed(3));
      el.style.setProperty('--orb-mid', mid.toFixed(3));
      el.style.setProperty('--orb-treble', treble.toFixed(3));
      if (active) raf = requestAnimationFrame(frame);
      else last = null;
    };

    const wake = () => {
      if (raf === 0) raf = requestAnimationFrame(frame);
    };

    const halt = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      last = null;
    };

    const unobserve = observeActivity(el, (next) => {
      active = next;
      if (next) wake();
      else halt();
    });

    wake();

    return () => {
      halt();
      unobserve();
    };
  }, [ref, state, levelRef, bands]);
};
```

lib/use-audio-level.ts
```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export type AudioLevelError = 'permission-denied' | 'unavailable';

interface SharedAudio {
  ctx: AudioContext;
  stream: MediaStream;
  analyser: AnalyserNode;
}

let engine: Promise<SharedAudio> | null = null;
let consumers = 0;

const createShared = async (): Promise<SharedAudio> => {
  if (!hasAudioInputSupport()) {
    throw new DOMException(
      'getUserMedia is unavailable. This usually means an insecure context (use localhost or https).',
      'NotSupportedError',
    );
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.7;
  source.connect(analyser);
  return { ctx, stream, analyser };
};

const teardown = () => {
  const current = engine;
  engine = null;
  if (!current) return;
  void current.then(
    (shared) => {
      shared.stream.getTracks().forEach((track) => track.stop());
      void shared.ctx.close();
    },
    () => {},
  );
};

export const acquireSharedAnalyser = (): Promise<AnalyserNode> => {
  consumers += 1;
  if (!engine) engine = createShared();
  const current = engine;
  return current.then(
    (shared) => shared.analyser,
    (error: unknown) => {
      if (engine === current) engine = null;
      throw error;
    },
  );
};

export const releaseSharedAnalyser = () => {
  consumers = Math.max(0, consumers - 1);
  if (consumers === 0) teardown();
};

export const classifyAudioError = (error: unknown): AudioLevelError =>
  error instanceof DOMException &&
  (error.name === 'NotAllowedError' || error.name === 'SecurityError')
    ? 'permission-denied'
    : 'unavailable';

export const hasAudioInputSupport = (): boolean =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

const VOICE_MIN_HZ = 85;
const VOICE_MAX_HZ = 3800;
const LEVEL_FLOOR = 0.14;
const LEVEL_RANGE = 0.62;
const PEAK_WEIGHT = 0.35;

export interface AudioLevel {
  levelRef: RefObject<number>;
  error: AudioLevelError | null;
}

export const useAudioLevel = (active: boolean, smoothing = 0.15): AudioLevel => {
  const levelRef = useRef<number>(-1);
  const [error, setError] = useState<AudioLevelError | null>(null);

  useEffect(() => {
    if (!active) {
      levelRef.current = -1;
      return;
    }

    let cancelled = false;
    let raf = 0;

    void acquireSharedAnalyser().then(
      (analyser) => {
        if (cancelled) return;
        setError(null);
        const bins = analyser.frequencyBinCount;
        const nyquist = analyser.context.sampleRate / 2;
        const binFor = (hz: number) =>
          Math.min(bins, Math.max(1, Math.round((hz / nyquist) * bins)));
        const voiceLo = binFor(VOICE_MIN_HZ);
        const voiceHi = Math.max(voiceLo + 1, binFor(VOICE_MAX_HZ));
        const data = new Uint8Array(bins);
        let smoothed = 0;

        const tick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          let peak = 0;
          for (let i = voiceLo; i < voiceHi; i += 1) {
            const value = data[i];
            sum += value;
            if (value > peak) peak = value;
          }
          const bandAvg = sum / (voiceHi - voiceLo) / 255;
          const bandPeak = peak / 255;
          const energy = (1 - PEAK_WEIGHT) * bandAvg + PEAK_WEIGHT * bandPeak;
          const norm = Math.min(1, Math.max(0, (energy - LEVEL_FLOOR) / LEVEL_RANGE));
          smoothed += (norm - smoothed) * smoothing;
          levelRef.current = smoothed;
          raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(classifyAudioError(err));
        levelRef.current = -1;
      },
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      releaseSharedAnalyser();
      levelRef.current = -1;
    };
  }, [active, smoothing]);

  return { levelRef, error };
};
```

lib/use-in-view.ts
```ts
'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export const observeActivity = (
  el: Element,
  onChange: (active: boolean) => void,
): (() => void) => {
  let inView = true;
  let pageVisible = document.visibilityState === 'visible';
  let active = inView && pageVisible;

  const sync = () => {
    const next = inView && pageVisible;
    if (next === active) return;
    active = next;
    onChange(next);
  };

  const observer = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1]?.isIntersecting ?? true;
    sync();
  });
  observer.observe(el);

  const onVisibility = () => {
    pageVisible = document.visibilityState === 'visible';
    sync();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
  };
};

export const useInView = (
  ref: RefObject<Element | null>,
  onChange?: (active: boolean) => void,
): RefObject<boolean> => {
  const activeRef = useRef(true);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const unobserve = observeActivity(el, (active) => {
      activeRef.current = active;
      onChangeRef.current?.(active);
    });
    return () => {
      unobserve();
      activeRef.current = true;
    };
  }, [ref]);

  return activeRef;
};
```

lib/use-webgl-support.ts
```ts
'use client';

import { useSyncExternalStore } from 'react';

let cached: boolean | null = null;

const detect = (): boolean => {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const attributes: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    cached =
      canvas.getContext('webgl2', attributes) !== null ||
      canvas.getContext('webgl', attributes) !== null;
  } catch {
    cached = false;
  }
  return cached;
};

const subscribe = (): (() => void) => () => {};
const getSnapshot = (): boolean | null => detect();
const getServerSnapshot = (): boolean | null => null;

export const useWebGLSupport = (): boolean | null =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
```

lib/use-audio-bands.ts
```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  acquireSharedAnalyser,
  classifyAudioError,
  releaseSharedAnalyser,
  type AudioLevelError,
} from './use-audio-level';

export interface AudioBands {
  bassRef: RefObject<number>;
  midRef: RefObject<number>;
  trebleRef: RefObject<number>;
  error: AudioLevelError | null;
}

const BASS_MAX_HZ = 300;
const MID_MAX_HZ = 2000;

const normalize = (value: number): number =>
  Math.min(1, Math.max(0, (value / 255 - 0.06) / 0.4));

export const useAudioBands = (active: boolean, smoothing = 0.2): AudioBands => {
  const bassRef = useRef<number>(-1);
  const midRef = useRef<number>(-1);
  const trebleRef = useRef<number>(-1);
  const [error, setError] = useState<AudioLevelError | null>(null);

  useEffect(() => {
    const reset = () => {
      bassRef.current = -1;
      midRef.current = -1;
      trebleRef.current = -1;
    };

    if (!active) {
      reset();
      return;
    }

    let cancelled = false;
    let raf = 0;

    void acquireSharedAnalyser().then(
      (analyser) => {
        if (cancelled) return;
        setError(null);
        const bins = analyser.frequencyBinCount;
        const nyquist = analyser.context.sampleRate / 2;
        const binFor = (hz: number) =>
          Math.min(bins, Math.max(1, Math.round((hz / nyquist) * bins)));
        const bassEnd = binFor(BASS_MAX_HZ);
        const midEnd = Math.max(bassEnd + 1, binFor(MID_MAX_HZ));
        const data = new Uint8Array(bins);
        let bass = 0;
        let mid = 0;
        let treble = 0;

        const average = (start: number, end: number): number => {
          let sum = 0;
          for (let i = start; i < end; i += 1) sum += data[i];
          return end > start ? sum / (end - start) : 0;
        };

        const tick = () => {
          analyser.getByteFrequencyData(data);
          bass += (normalize(average(0, bassEnd)) - bass) * smoothing;
          mid += (normalize(average(bassEnd, midEnd)) - mid) * smoothing;
          treble += (normalize(average(midEnd, bins)) - treble) * smoothing;
          bassRef.current = bass;
          midRef.current = mid;
          trebleRef.current = treble;
          raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(classifyAudioError(err));
        reset();
      },
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      releaseSharedAnalyser();
      reset();
    };
  }, [active, smoothing]);

  return { bassRef, midRef, trebleRef, error };
};
```

lib/use-waveform.ts
```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  acquireSharedAnalyser,
  classifyAudioError,
  releaseSharedAnalyser,
  type AudioLevelError,
} from './use-audio-level';

export interface Waveform {
  samplesRef: RefObject<Uint8Array>;
  error: AudioLevelError | null;
}

const EMPTY = new Uint8Array(0);

export const useWaveform = (active: boolean): Waveform => {
  const samplesRef = useRef<Uint8Array>(EMPTY);
  const [error, setError] = useState<AudioLevelError | null>(null);

  useEffect(() => {
    if (!active) {
      samplesRef.current = EMPTY;
      return;
    }

    let cancelled = false;
    let raf = 0;

    void acquireSharedAnalyser().then(
      (analyser) => {
        if (cancelled) return;
        setError(null);
        const data = new Uint8Array(analyser.fftSize);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          samplesRef.current = data;
          raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(classifyAudioError(err));
        samplesRef.current = EMPTY;
      },
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      releaseSharedAnalyser();
      samplesRef.current = EMPTY;
    };
  }, [active]);

  return { samplesRef, error };
};
```

lib/use-orb-cues.ts
```ts
'use client';

import { useEffect, useRef } from 'react';
import type { OrbState } from './orb-state';

export interface OrbCuesOptions {
  enabled?: boolean;
  haptics?: boolean;
  volume?: number;
}

interface CueTone {
  freq: number;
  type: OscillatorType;
  delay: number;
  duration: number;
  gain: number;
}

interface Cue {
  tones: CueTone[];
  vibration: number | number[];
}

const CUES: Partial<Record<OrbState, Cue>> = {
  listening: {
    tones: [{ freq: 880, type: 'sine', delay: 0, duration: 0.14, gain: 1 }],
    vibration: 12,
  },
  thinking: {
    tones: [{ freq: 320, type: 'triangle', delay: 0, duration: 0.05, gain: 0.7 }],
    vibration: 8,
  },
  speaking: {
    tones: [
      { freq: 523.25, type: 'sine', delay: 0, duration: 0.12, gain: 0.8 },
      { freq: 783.99, type: 'sine', delay: 0.09, duration: 0.16, gain: 1 },
    ],
    vibration: [10, 40, 10],
  },
  error: {
    tones: [
      { freq: 164.81, type: 'square', delay: 0, duration: 0.24, gain: 0.6 },
      { freq: 175, type: 'square', delay: 0, duration: 0.24, gain: 0.6 },
    ],
    vibration: [60, 40, 60],
  },
};

const playCue = (ctx: AudioContext, cue: Cue, volume: number) => {
  for (const tone of cue.tones) {
    const t0 = ctx.currentTime + tone.delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume * tone.gain, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + tone.duration + 0.02);
  }
};

export const useOrbCues = (
  state: OrbState,
  { enabled = true, haptics = true, volume = 0.2 }: OrbCuesOptions = {},
) => {
  const prevRef = useRef(state);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!enabled || prev === state) return;

    const cue = CUES[state];
    if (!cue) return;

    if (!ctxRef.current && typeof window !== 'undefined' && 'AudioContext' in window) {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== 'closed') {
      if (ctx.state === 'suspended') void ctx.resume();
      playCue(ctx, cue, Math.min(1, Math.max(0, volume)));
    }

    if (haptics && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(cue.vibration);
    }
  }, [state, enabled, haptics, volume]);

  useEffect(
    () => () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    [],
  );
};
```

lib/orb-status.tsx
```tsx
import type { OrbState } from './orb-state';

const STATUS_TEXT: Record<OrbState, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Error',
  disabled: 'Muted',
};

export interface OrbStatusProps {
  state: OrbState;
  className?: string;
}

export const OrbStatus = ({ state, className }: OrbStatusProps) => (
  <span role="status" aria-live="polite" aria-atomic="true" className={className}>
    {STATUS_TEXT[state]}
  </span>
);
```

Create the component files:

particles-orb.tsx
```tsx
'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  approach,
  createStateMix,
  ERROR_COLOR_FROM,
  ERROR_COLOR_TO,
  hexToRgb,
  ORB_STATES,
  orbVars,
  stateEnergy,
  stateMotion,
  type OrbProps,
} from '../../lib/orb-state';
import { useOrbLevel } from '../../lib/use-orb-level';
import { observeActivity } from '../../lib/use-in-view';

const PARTICLE_COUNT = 720;
const TWO_PI = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const STATIC_TIME = 1.7;

const ERROR_FROM_RGB = hexToRgb(ERROR_COLOR_FROM);
const ERROR_TO_RGB = hexToRgb(ERROR_COLOR_TO);

type Rgb = [number, number, number];

const mixRgb = (a: Rgb, b: Rgb, m: number): Rgb => [
  a[0] + (b[0] - a[0]) * m,
  a[1] + (b[1] - a[1]) * m,
  a[2] + (b[2] - a[2]) * m,
];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

interface SpherePoint {
  x: number;
  y: number;
  z: number;
  ringFrac: number;
  seed: number;
  tone: number;
}

const buildSphere = (count: number): SpherePoint[] => {
  const points: SpherePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = GOLDEN_ANGLE * i;
    points.push({
      x: Math.cos(theta) * radiusAtY,
      y,
      z: Math.sin(theta) * radiusAtY,
      ringFrac: (i * 0.61803398875) % 1,
      seed: ((i * 0.7548776662) % 1) * TWO_PI,
      tone: (i * 0.5436890126) % 1,
    });
  }
  return points;
};

export const ParticlesOrb = ({
  state = 'idle',
  size = 168,
  speed = 1,
  colorFrom = '#f0abfc',
  colorTo = '#818cf8',
  levelRef,
  label = 'Assistant orb',
  className,
  ref: forwardedRef,
}: OrbProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const speedRef = useRef(speed);
  const colorRef = useRef({ from: colorFrom, to: colorTo });
  const drawStaticRef = useRef<(() => void) | null>(null);

  const setHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      hostRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  useEffect(() => {
    stateRef.current = state;
    speedRef.current = speed;
    colorRef.current = { from: colorFrom, to: colorTo };
  });

  useOrbLevel(hostRef, state, levelRef);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const points = buildSphere(PARTICLE_COUNT);
    const center = size / 2;
    const baseRadius = center * 0.62;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const stateMix = createStateMix(stateRef.current);
    let t = reduce ? STATIC_TIME : 0;
    let angleY = 0;
    let connectingPhase = 0;
    const angleX = 0.32;
    let levelS = 0;
    let raf = 0;
    let last: number | null = null;
    let running = true;

    const render = (dt: number, isStatic = false) => {
      const st = stateRef.current;
      const spd = speedRef.current;
      const easeDt = isStatic ? 60 : dt;
      const w = stateMix.update(st, easeDt);

      let ripple = 0;
      let pulse = 0;
      let flow = 0;
      for (const s of ORB_STATES) {
        const kind = stateMotion(s);
        if (kind === 'ripple') ripple += w[s];
        else if (kind === 'pulse') pulse += w[s];
        else if (kind === 'flow') flow += w[s];
      }
      const wIdle = w.idle;
      const wConn = w.connecting;
      const wError = w.error;
      const wDisabled = w.disabled;
      const motionScale = 1 - wDisabled * 0.96;

      const rawLevel = isStatic
        ? stateEnergy(st, t)
        : clamp01(Number.parseFloat(getComputedStyle(host).getPropertyValue('--orb-level')) || 0);
      levelS = approach(levelS, rawLevel, 9, easeDt);
      const level = levelS;

      const spin = (0.14 + ripple * (0.9 + level * 1.6) + flow * 0.4 + wConn * 0.3) * motionScale;
      angleY += dt * spd * spin;
      connectingPhase = (connectingPhase + dt * spd * 1.1) % TWO_PI;

      const breathe = 0.05 * (0.25 + wIdle * 0.75) * Math.sin(t * 1.1 * spd) * motionScale;
      const conv = pulse * (0.22 + 0.12 * Math.sin(t * 2.6 * spd + 1));
      const expand = flow * (0.08 + level * 0.32);
      const radius = baseRadius * (1 + breathe + level * 0.16 + expand - conv);

      const from = mixRgb(hexToRgb(colorRef.current.from), ERROR_FROM_RGB, wError);
      const to = mixRgb(hexToRgb(colorRef.current.to), ERROR_TO_RGB, wError);

      const shakeAmp = wError * radius * 0.05 * motionScale;
      const shakeX = shakeAmp * (Math.sin(t * 26 * spd) + 0.5 * Math.sin(t * 15.7 * spd));
      const shakeY = shakeAmp * (Math.cos(t * 22.5 * spd) + 0.5 * Math.sin(t * 13.1 * spd));

      const idleAmp = wIdle * radius * 0.055 * motionScale;
      const jitterAmp = (flow + wError * 0.7) * radius * (0.015 + level * 0.085) * motionScale;
      const rippleAmp = ripple * (0.045 + level * 0.24);
      const pulseAmp = pulse * 0.16;
      const alphaScale = 1 - wDisabled * 0.35;

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      ctx.clearRect(0, 0, size, size);
      const glow = ripple + pulse + flow;
      ctx.globalCompositeOperation = !isStatic && glow > 0.5 ? 'lighter' : 'source-over';

      for (let i = 0; i < points.length; i += 1) {
        const p = points[i];

        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y1 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;

        const depth = (z2 + 1) / 2;
        const perspective = 0.65 + depth * 0.45;

        let pointRadius = radius;
        if (rippleAmp > 0.002) {
          pointRadius *= 1 + rippleAmp * Math.sin(p.y * 4.5 - t * 6.5 * spd);
        }
        if (pulseAmp > 0.002) {
          pointRadius *= 1 - pulseAmp * (0.5 + 0.5 * Math.sin(p.ringFrac * TWO_PI + t * 3.1 * spd));
        }

        let ox = shakeX;
        let oy = shakeY;
        if (idleAmp > 0.01) {
          ox +=
            idleAmp *
            (Math.sin(t * 0.55 * spd + p.seed * 3.7) + 0.5 * Math.sin(t * 1.3 * spd + p.seed * 1.3));
          oy +=
            idleAmp *
            (Math.cos(t * 0.62 * spd + p.seed * 2.9) +
              0.5 * Math.sin(t * 1.05 * spd + p.seed * 5.1));
        }
        if (jitterAmp > 0.01) {
          ox += jitterAmp * Math.sin(t * 14 * spd + p.seed * 9.3);
          oy += jitterAmp * Math.cos(t * 17 * spd + p.seed * 6.1);
        }

        const sphereX = center + x1 * pointRadius * perspective + ox;
        const sphereY = center + y1 * pointRadius * perspective + oy;
        const sphereAlpha = (0.12 + depth * depth * 0.78) * alphaScale;
        const sphereDot = 0.6 + depth * 1.5;

        let screenX = sphereX;
        let screenY = sphereY;
        let alpha = sphereAlpha;
        let dot = sphereDot;

        if (wConn > 0.004) {
          const base = (i / points.length) * TWO_PI;
          const jitter = 0.05 * Math.sin(t * 1.3 + p.seed);
          const ringAngle = base + connectingPhase + jitter;
          const ringR =
            center * (0.58 + 0.13 * p.ringFrac) * (1 + 0.05 * Math.sin(t + p.seed * 1.7));
          const circleX = center + Math.cos(ringAngle) * ringR;
          const circleY = center + Math.sin(ringAngle) * ringR;
          const ringAlpha = 0.35 + p.tone * 0.5;
          const ringDot = 0.75 + p.tone * 0.9;

          screenX = sphereX + (circleX - sphereX) * wConn;
          screenY = sphereY + (circleY - sphereY) * wConn;
          alpha = sphereAlpha + (ringAlpha - sphereAlpha) * wConn;
          dot = sphereDot + (ringDot - sphereDot) * wConn;
        }

        const cr = from[0] + (to[0] - from[0]) * p.tone;
        const cg = from[1] + (to[1] - from[1]) * p.tone;
        const cb = from[2] + (to[2] - from[2]) * p.tone;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${cr | 0}, ${cg | 0}, ${cb | 0}, ${alpha.toFixed(3)})`;
        ctx.arc(screenX, screenY, dot, 0, TWO_PI);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
    };

    if (reduce) {
      render(0, true);
      drawStaticRef.current = () => render(0, true);
      return () => {
        drawStaticRef.current = null;
      };
    }

    const frame = (now: number) => {
      raf = 0;
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      t += dt;
      render(dt);
      if (running) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf === 0) {
        last = null;
        raf = requestAnimationFrame(frame);
      }
    };

    const halt = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      last = null;
    };

    const unobserve = observeActivity(host, (active) => {
      running = active;
      if (active) wake();
      else halt();
    });

    wake();

    return () => {
      halt();
      unobserve();
    };
  }, [size]);

  useEffect(() => {
    drawStaticRef.current?.();
  }, [state, colorFrom, colorTo]);

  return (
    <div
      ref={setHostRef}
      role="img"
      aria-label={label}
      data-state={state}
      className={className}
      style={{
        ...orbVars({ size, speed, colorFrom, colorTo }),
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        opacity: state === 'disabled' ? 0.5 : 1,
        filter: state === 'disabled' ? 'grayscale(0.85)' : undefined,
        transition: 'opacity 0.4s ease, filter 0.4s ease',
      }}
    >
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
    </div>
  );
};
```

Notes:
- It is a client component ("use client"). Keep the file paths shown above; if the project has no src/ directory, place them under registry/ at the project root and adjust the import paths accordingly.
- Props: state ('idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'; plus the optional extensions 'error' | 'disabled'), size (px), speed (multiplier), colorFrom, colorTo, levelRef (RefObject<number>; 0..1 live audio amplitude, a negative value means "no live audio" and the orb falls back to a procedural animation), label, className.
- Theming: the orb reads the CSS variables --orb-size, --orb-speed, --orb-color-from, --orb-color-to and --orb-level, so it can also be themed or animated from CSS.
- Minimal wiring: drive state from the assistant lifecycle and pass a levelRef from the bundled use-audio-level hook (mic while listening; use TTS output while speaking):
```tsx
'use client';
import { useState } from 'react';
import type { OrbState } from '@/registry/lib/orb-state';
import { useAudioLevel } from '@/registry/lib/use-audio-level';
import { ParticlesOrb } from '@/registry/orbe/particles-orb/particles-orb';

export const AssistantOrb = () => {
  const [state, setState] = useState<OrbState>('idle');
  const { levelRef } = useAudioLevel(state === 'listening');
  return <ParticlesOrb state={state} levelRef={levelRef} />;
};
```
- For smooth per-frame transitions between states, orb-state.ts also exports the helpers approach() (exponential easing toward a target) and createStateMix() (blends state weights over time).
- Accessibility: render the shared <OrbStatus state={state} /> (lib/orb-status.tsx) near the orb so state changes are announced to screen readers via a polite live region, and never signal the error state by color alone (keep a visible text cue such as OrbStatus).
- Respect `prefers-reduced-motion`.

Requested configuration (current playground values, render the orb with exactly these props):
```tsx
import { ParticlesOrb } from '@/registry/orbe/particles-orb/particles-orb';

export const Assistant = () => (
  <ParticlesOrb
    state="listening"
    size={168}
    speed={0.5}
    colorFrom="#818cf8"
    colorTo="#22d3ee"
  />
);
```