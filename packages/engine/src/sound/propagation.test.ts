import { describe, expect, it } from 'vitest';
import { vec } from '../core/math';
import { DynamicGrid } from '../level/dynamic';
import { Grid } from '../level/grid';
import type { LevelData } from '../level/types';
import { buildTestLevel } from '../testing/test-level';
import { audibleRadius, distanceLoss, obstructionLoss, receivedLevel, WALL_DB, type SoundContext } from './propagation';

const ctxFor = (level: LevelData): SoundContext => ({ level, grid: new Grid(level), dynamic: new DynamicGrid(level) });

describe('sound propagation', () => {
  it('falls off by 6 dB per doubling of distance in the open', () => {
    const ctx = ctxFor(buildTestLevel());
    const at5 = receivedLevel(ctx, vec(5, 20), 60, vec(10, 20));
    const at10 = receivedLevel(ctx, vec(5, 20), 60, vec(15, 20));
    expect(at5 - at10).toBeCloseTo(6.02, 1);
    expect(distanceLoss(0.2)).toBe(0);
  });

  it('loses one wall step per wall crossed', () => {
    const one = ctxFor(buildTestLevel({}, (b) => b.addWall(vec(15, 0), vec(15, 40), { height: 3 })));
    expect(obstructionLoss(one, vec(5, 20), vec(25, 20))).toBe(WALL_DB);
    const two = ctxFor(
      buildTestLevel({}, (b) => {
        b.addWall(vec(12, 0), vec(12, 40), { height: 3 });
        b.addWall(vec(18, 0), vec(18, 40), { height: 3 });
      }),
    );
    expect(obstructionLoss(two, vec(5, 20), vec(25, 20))).toBe(2 * WALL_DB);
  });

  it('passes over a low wall unhindered and through a fence freely', () => {
    const low = ctxFor(buildTestLevel({}, (b) => b.addWall(vec(15, 0), vec(15, 40), { height: 0.8 })));
    expect(obstructionLoss(low, vec(5, 20), vec(25, 20))).toBe(0);
    const fence = ctxFor(buildTestLevel({}, (b) => b.addWall(vec(15, 0), vec(15, 40), { height: 2.5, transparent: true })));
    expect(obstructionLoss(fence, vec(5, 20), vec(25, 20))).toBe(0);
  });

  it('applies closed-door damping', () => {
    const level = buildTestLevel();
    const ctx = ctxFor(level);
    ctx.dynamic.block(ctx.grid.cellsInRadius(vec(15, 20), 0.6), { occlusion: 2.2, soundDamping: 10 });
    expect(obstructionLoss(ctx, vec(5, 20), vec(25, 20))).toBe(10);
  });

  it('computes the open-ground audible radius used by the noise overlay', () => {
    expect(audibleRadius(60, 30)).toBeCloseTo(31.62, 1);
    expect(audibleRadius(30, 30)).toBe(0);
  });
});
