/**
 * Procedural sound effects. Every effect is synthesised from noise, oscillators and envelopes at
 * first use, so the game ships no licensed or third-party samples (asset register: "synthesised").
 */
export type SoundName =
  | 'step-soft'
  | 'step-hard'
  | 'step-wood'
  | 'step-water'
  | 'door'
  | 'thud'
  | 'impact'
  | 'device'
  | 'suppressed'
  | 'harpoon'
  | 'gunshot'
  | 'explosion'
  | 'bell'
  | 'tool'
  | 'stinger-alert'
  | 'stinger-spotted'
  | 'ui-click'
  | 'ui-deny'
  | 'success'
  | 'failure';

export type LoopName = 'rain' | 'surf' | 'wind' | 'siren' | 'static';

type Fill = (out: Float32Array, rate: number, random: () => number) => void;

const TAU = Math.PI * 2;

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Attack-then-exponential-decay envelope. */
const env = (t: number, attack: number, decay: number) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

function lowpass(buf: Float32Array, cutoff: number, rate: number): Float32Array {
  const a = 1 - Math.exp((-TAU * cutoff) / rate);
  let y = 0;
  for (let i = 0; i < buf.length; i += 1) {
    y += a * (buf[i]! - y);
    buf[i] = y;
  }
  return buf;
}

function highpass(buf: Float32Array, cutoff: number, rate: number): Float32Array {
  const a = Math.exp((-TAU * cutoff) / rate);
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const x = buf[i]!;
    const y = a * (prevY + x - prevX);
    prevX = x;
    prevY = y;
    buf[i] = y;
  }
  return buf;
}

function noise(length: number, random: () => number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = random() * 2 - 1;
  return out;
}

function normalize(buf: Float32Array, peak: number): void {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max === 0) return;
  const k = peak / max;
  for (let i = 0; i < buf.length; i += 1) buf[i]! *= k;
}

/** Adds a sine whose frequency glides exponentially from f0 to f1, shaped by an envelope. */
function addGlide(out: Float32Array, rate: number, f0: number, f1: number, glide: number, amp: number, envelope: (t: number) => number, start = 0): void {
  let phase = 0;
  const from = Math.floor(start * rate);
  for (let i = from; i < out.length; i += 1) {
    const t = (i - from) / rate;
    const f = f1 + (f0 - f1) * Math.exp(-t / glide);
    phase += (TAU * f) / rate;
    out[i]! += Math.sin(phase) * amp * envelope(t);
  }
}

function addNoise(out: Float32Array, rate: number, random: () => number, amp: number, envelope: (t: number) => number, filter?: { lp?: number; hp?: number }, start = 0): void {
  const from = Math.floor(start * rate);
  const n = noise(out.length - from, random);
  if (filter?.hp) highpass(n, filter.hp, rate);
  if (filter?.lp) lowpass(n, filter.lp, rate);
  for (let i = 0; i < n.length; i += 1) out[from + i]! += n[i]! * amp * envelope(i / rate);
}

const SOUNDS: Record<SoundName, { seconds: number; peak: number; fill: Fill }> = {
  'step-soft': {
    seconds: 0.11,
    peak: 0.45,
    fill: (o, r, rnd) => {
      addNoise(o, r, rnd, 1, (t) => env(t, 0.004, 0.025), { lp: 700 + rnd() * 500 });
      addGlide(o, r, 110, 70, 0.02, 0.35, (t) => env(t, 0.002, 0.02));
    },
  },
  'step-hard': {
    seconds: 0.08,
    peak: 0.5,
    fill: (o, r, rnd) => addNoise(o, r, rnd, 1, (t) => env(t, 0.0008, 0.012), { hp: 1200 + rnd() * 800, lp: 7000 }),
  },
  'step-wood': {
    seconds: 0.14,
    peak: 0.5,
    fill: (o, r, rnd) => {
      addGlide(o, r, 190 + rnd() * 30, 150, 0.05, 1, (t) => env(t, 0.002, 0.04));
      addNoise(o, r, rnd, 0.4, (t) => env(t, 0.001, 0.01), { lp: 3000 });
    },
  },
  'step-water': {
    seconds: 0.3,
    peak: 0.4,
    fill: (o, r, rnd) => {
      addNoise(o, r, rnd, 1, (t) => env(t, 0.01, 0.07) * (0.6 + 0.4 * Math.sin(t * 190)), { hp: 700, lp: 4200 });
    },
  },
  door: {
    seconds: 1,
    peak: 0.55,
    fill: (o, r, rnd) => {
      let phase = 0;
      for (let i = 0; i < Math.floor(0.75 * r); i += 1) {
        const t = i / r;
        const f = 210 + 70 * Math.sin(TAU * 1.3 * t) + 25 * (rnd() - 0.5);
        phase += (TAU * f) / r;
        const stick = Math.max(0, Math.sin(TAU * 34 * t));
        o[i]! += Math.sin(phase) * stick * env(t, 0.06, 0.45) * 0.6;
      }
      addGlide(o, r, 95, 60, 0.05, 1, (t) => env(t, 0.002, 0.06), 0.78);
    },
  },
  thud: {
    seconds: 0.4,
    peak: 0.7,
    fill: (o, r, rnd) => {
      addGlide(o, r, 120, 42, 0.06, 1, (t) => env(t, 0.003, 0.09));
      addNoise(o, r, rnd, 0.5, (t) => env(t, 0.002, 0.05), { lp: 500 });
    },
  },
  impact: {
    seconds: 0.25,
    peak: 0.6,
    fill: (o, r, rnd) => {
      addNoise(o, r, rnd, 1, (t) => env(t, 0.0005, 0.008), { hp: 1800 });
      addNoise(o, r, rnd, 0.55, (t) => env(t, 0.0005, 0.007), { hp: 2200 }, 0.085);
      addNoise(o, r, rnd, 0.3, (t) => env(t, 0.0005, 0.006), { hp: 2600 }, 0.15);
    },
  },
  device: {
    seconds: 1.5,
    peak: 0.6,
    fill: (o, r, rnd) => {
      for (let k = 0; k < 22; k += 1) {
        const start = k * 0.06 + rnd() * 0.03;
        addGlide(o, r, 2300 + rnd() * 900, 1900, 0.02, 0.5, (t) => env(t, 0.0005, 0.015), start);
        addNoise(o, r, rnd, 0.35, (t) => (t < 0.01 ? env(t, 0.0005, 0.004) : 0), { hp: 2500 }, start);
      }
    },
  },
  suppressed: {
    seconds: 0.35,
    peak: 0.6,
    fill: (o, r, rnd) => {
      addNoise(o, r, rnd, 1, (t) => env(t, 0.002, 0.04), { hp: 600, lp: 3000 });
      addGlide(o, r, 150, 55, 0.04, 0.6, (t) => env(t, 0.002, 0.05));
    },
  },
  harpoon: {
    seconds: 0.55,
    peak: 0.55,
    fill: (o, r, rnd) => {
      addGlide(o, r, 430, 250, 0.08, 1, (t) => env(t, 0.002, 0.18));
      addNoise(o, r, rnd, 0.3, (t) => env(t, 0.01, 0.1), { hp: 2000 });
    },
  },
  gunshot: {
    seconds: 1.8,
    peak: 0.95,
    fill: (o, r, rnd) => {
      addNoise(o, r, rnd, 1, (t) => env(t, 0.0004, 0.012));
      addGlide(o, r, 95, 38, 0.08, 0.8, (t) => env(t, 0.002, 0.25));
      addNoise(o, r, rnd, 0.22, (t) => env(t, 0.02, 0.5), { lp: 1200 });
    },
  },
  explosion: {
    seconds: 3.2,
    peak: 0.95,
    fill: (o, r, rnd) => {
      addNoise(o, r, rnd, 1, (t) => env(t, 0.008, 0.9), { lp: 380 });
      addGlide(o, r, 52, 28, 0.4, 0.9, (t) => env(t, 0.005, 0.8));
      addNoise(o, r, rnd, 0.25, (t) => env(t, 0.05, 0.5) * (rnd() < 0.02 ? 1 : 0.15), { hp: 1500 });
    },
  },
  bell: {
    seconds: 2.8,
    peak: 0.6,
    fill: (o, r, rnd) => {
      const partials: [number, number, number][] = [
        [1, 1, 1.4],
        [2.02, 0.5, 0.9],
        [2.42, 0.35, 0.7],
        [3.01, 0.25, 0.5],
        [4.17, 0.15, 0.35],
      ];
      for (const [ratio, amp, decay] of partials) addGlide(o, r, 640 * ratio, 640 * ratio, 1, amp, (t) => env(t, 0.002, decay));
      addNoise(o, r, rnd, 0.3, (t) => env(t, 0.0005, 0.01), { hp: 3000 });
    },
  },
  tool: {
    seconds: 0.5,
    peak: 0.35,
    fill: (o, r, rnd) => {
      for (const start of [0, 0.15, 0.32]) {
        addGlide(o, r, 3200 + rnd() * 600, 3000, 0.01, 1, (t) => env(t, 0.0005, 0.01), start);
        addNoise(o, r, rnd, 0.4, (t) => (t < 0.01 ? env(t, 0.0005, 0.004) : 0), { hp: 3000 }, start);
      }
    },
  },
  'stinger-alert': {
    seconds: 1.8,
    peak: 0.5,
    fill: (o, r) => {
      for (const f of [110, 116.5, 164.8]) {
        for (let h = 1; h <= 6; h += 1) addGlide(o, r, f * h, f * h, 1, 1 / h, (t) => env(t, 0.03, 0.7));
      }
      lowpass(o, 2400, r);
    },
  },
  'stinger-spotted': {
    seconds: 0.6,
    peak: 0.4,
    fill: (o, r) => {
      addGlide(o, r, 440, 880, 0.05, 1, (t) => env(t, 0.005, 0.18));
      addGlide(o, r, 660, 1320, 0.05, 0.6, (t) => env(t, 0.005, 0.2), 0.08);
    },
  },
  'ui-click': {
    seconds: 0.05,
    peak: 0.3,
    fill: (o, r) => addGlide(o, r, 1800, 1800, 1, 1, (t) => env(t, 0.001, 0.01)),
  },
  'ui-deny': {
    seconds: 0.26,
    peak: 0.3,
    fill: (o, r) => {
      addGlide(o, r, 330, 330, 1, 1, (t) => (t < 0.09 ? env(t, 0.004, 0.06) : 0));
      addGlide(o, r, 247, 247, 1, 1, (t) => (t < 0.12 ? env(t, 0.004, 0.08) : 0), 0.11);
    },
  },
  success: {
    seconds: 2.8,
    peak: 0.4,
    fill: (o, r) => {
      [261.6, 329.6, 392, 523.3].forEach((f, i) => addGlide(o, r, f, f, 1, 1, (t) => env(t, 0.02, 0.9), i * 0.18));
    },
  },
  failure: {
    seconds: 2.8,
    peak: 0.4,
    fill: (o, r) => {
      [220, 174.6, 146.8].forEach((f, i) => addGlide(o, r, f, f, 1, 1, (t) => env(t, 0.03, 1.1), i * 0.3));
    },
  },
};

const LOOPS: Record<LoopName, { seconds: number; peak: number; fill: Fill }> = {
  rain: {
    seconds: 4,
    peak: 0.5,
    fill: (o, r, rnd) => {
      const bed = highpass(lowpass(noise(o.length, rnd), 5200, r), 380, r);
      for (let i = 0; i < o.length; i += 1) o[i] = bed[i]! * 0.6;
      for (let k = 0; k < 160; k += 1) addNoise(o, r, rnd, 0.5 + rnd(), (t) => (t < 0.012 ? env(t, 0.0005, 0.003) : 0), { hp: 2800 }, rnd() * (o.length / r - 0.02));
    },
  },
  surf: {
    seconds: 8,
    peak: 0.5,
    fill: (o, r, rnd) => {
      let brown = 0;
      for (let i = 0; i < o.length; i += 1) {
        brown = brown * 0.995 + (rnd() * 2 - 1) * 0.05;
        const t = i / r;
        const swell = 0.45 + 0.55 * Math.sin((Math.PI * t) / 4) ** 2;
        o[i] = brown * swell;
      }
      lowpass(o, 900, r);
    },
  },
  wind: {
    seconds: 6,
    peak: 0.35,
    fill: (o, r, rnd) => {
      const n = lowpass(noise(o.length, rnd), 500, r);
      for (let i = 0; i < o.length; i += 1) o[i] = n[i]! * (0.6 + 0.4 * Math.sin((TAU * i) / o.length));
    },
  },
  siren: {
    seconds: 4,
    peak: 0.45,
    fill: (o, r) => {
      let phase = 0;
      for (let i = 0; i < o.length; i += 1) {
        const t = i / r;
        const f = 520 + 380 * (0.5 - 0.5 * Math.cos((TAU * t) / 4));
        phase += (TAU * f) / r;
        o[i] = Math.sin(phase) * 0.8 + Math.sin(phase * 2) * 0.15;
      }
    },
  },
  static: {
    seconds: 2,
    peak: 0.25,
    fill: (o, r, rnd) => {
      const n = highpass(noise(o.length, rnd), 1500, r);
      for (let i = 0; i < o.length; i += 1) o[i] = n[i]! * (rnd() < 0.002 ? 3 : 1);
    },
  },
};

/** Crossfades the tail into the head so a loop has no click at the seam. */
function makeSeamless(buf: Float32Array, rate: number): void {
  const fade = Math.floor(rate * 0.08);
  for (let i = 0; i < fade; i += 1) {
    const k = i / fade;
    buf[i] = buf[i]! * k + buf[buf.length - fade + i]! * (1 - k);
  }
}

export class SoundBank {
  private readonly cache = new Map<string, AudioBuffer[]>();

  constructor(private readonly ctx: BaseAudioContext) {}

  /** A buffer for the effect; footsteps and impacts have a few variants to avoid machine-gunning. */
  get(name: SoundName): AudioBuffer {
    let variants = this.cache.get(name);
    if (!variants) {
      const def = SOUNDS[name];
      const count = name.startsWith('step-') || name === 'impact' || name === 'thud' ? 4 : 1;
      variants = Array.from({ length: count }, (_, v) => this.render(def, 1000 + v * 77 + name.length * 13, false));
      this.cache.set(name, variants);
    }
    return variants[Math.floor(Math.random() * variants.length)]!;
  }

  loop(name: LoopName): AudioBuffer {
    const key = `loop:${name}`;
    let variants = this.cache.get(key);
    if (!variants) {
      variants = [this.render(LOOPS[name], 4242 + name.length, true)];
      this.cache.set(key, variants);
    }
    return variants[0]!;
  }

  private render(def: { seconds: number; peak: number; fill: Fill }, seed: number, seamless: boolean): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const data = new Float32Array(Math.ceil(def.seconds * rate));
    def.fill(data, rate, lcg(seed));
    normalize(data, def.peak);
    if (seamless) makeSeamless(data, rate);
    const buffer = this.ctx.createBuffer(1, data.length, rate);
    buffer.copyToChannel(data, 0);
    return buffer;
  }
}
