/**
 * Deterministic pseudo-random number generator (xoshiro128**).
 *
 * The complete generator state is four 32-bit words of plain data, so it can be written into a
 * save game and restored to continue the exact same sequence. Simulation code must use this
 * instead of Math.random().
 */
export type RngState = readonly [number, number, number, number];

const UINT32_RANGE = 4294967296;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Expands a 32-bit seed into a well-mixed generator state (splitmix32). */
export function seedRng(seed: number): RngState {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const state: [number, number, number, number] = [next(), next(), next(), next()];
  // xoshiro must never run with an all-zero state.
  if (state.every((word) => word === 0)) state[0] = 1;
  return state;
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(state: RngState) {
    [this.s0, this.s1, this.s2, this.s3] = state.map((word) => word >>> 0) as [number, number, number, number];
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) throw new Error('Rng state must not be all zeros');
  }

  static fromSeed(seed: number): Rng {
    return new Rng(seedRng(seed));
  }

  /** Current state, suitable for serialization. */
  get state(): RngState {
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0];
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number {
    if (!(maxExclusive > minInclusive)) throw new RangeError(`empty integer range [${minInclusive}, ${maxExclusive})`);
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('cannot pick from an empty list');
    return items[this.int(0, items.length)] as T;
  }

  /** Fisher–Yates shuffle, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i + 1);
      [items[i], items[j]] = [items[j] as T, items[i] as T];
    }
    return items;
  }
}
