import { describe, expect, it } from 'vitest';
import { Rng, seedRng } from './rng';

const take = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.nextUint32());

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(take(Rng.fromSeed(1234), 50)).toEqual(take(Rng.fromSeed(1234), 50));
  });

  it('produces different sequences for different seeds', () => {
    expect(take(Rng.fromSeed(1), 10)).not.toEqual(take(Rng.fromSeed(2), 10));
  });

  it('continues identically after its state is serialized and restored', () => {
    const original = Rng.fromSeed(98765);
    take(original, 17);
    const restored = new Rng(JSON.parse(JSON.stringify(original.state)));
    expect(take(restored, 100)).toEqual(take(original, 100));
  });

  it('never seeds an all-zero state and rejects one explicitly', () => {
    expect(seedRng(0).some((word) => word !== 0)).toBe(true);
    expect(() => new Rng([0, 0, 0, 0])).toThrow();
  });

  it('keeps floats in [0, 1) with a sane mean', () => {
    const rng = Rng.fromSeed(7);
    let sum = 0;
    for (let i = 0; i < 20000; i += 1) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 20000).toBeGreaterThan(0.48);
    expect(sum / 20000).toBeLessThan(0.52);
  });

  it('keeps integers inside the requested range and covers it', () => {
    const rng = Rng.fromSeed(42);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i += 1) {
      const n = rng.int(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThan(9);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7, 8]);
    expect(() => rng.int(5, 5)).toThrow(RangeError);
  });

  it('shuffles deterministically and keeps every element', () => {
    const a = Rng.fromSeed(5).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = Rng.fromSeed(5).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
