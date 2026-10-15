import { describe, expect, it } from 'vitest';
import { vec } from '../core/math';
import { DynamicGrid } from '../level/dynamic';
import { Grid } from '../level/grid';
import type { LevelData } from '../level/types';
import { buildTestLevel } from '../testing/test-level';
import { TARGET_HEIGHT, traceSight, visibilityFan, type SightContext, type SmokeVolume } from './los';

function ctxFor(level: LevelData, smoke: SmokeVolume[] = []): SightContext {
  return { level, grid: new Grid(level), dynamic: new DynamicGrid(level), smoke };
}

const EYE = 1.6;

describe('traceSight', () => {
  it('sees across open ground', () => {
    const ctx = ctxFor(buildTestLevel());
    expect(traceSight(ctx, vec(5, 20), EYE, vec(30, 20), TARGET_HEIGHT.stand).clear).toBe(true);
  });

  it('is blocked by a full-height wall', () => {
    const ctx = ctxFor(buildTestLevel({}, (b) => b.addWall(vec(15, 0), vec(15, 40), { height: 3 })));
    expect(traceSight(ctx, vec(5, 20), EYE, vec(30, 20), TARGET_HEIGHT.stand).clear).toBe(false);
  });

  it('lets a low wall hide a prone target but not a standing one', () => {
    const ctx = ctxFor(buildTestLevel({}, (b) => b.addWall(vec(15, 0), vec(15, 40), { height: 1.0 })));
    expect(traceSight(ctx, vec(5, 20), EYE, vec(16, 20), TARGET_HEIGHT.stand).clear).toBe(true);
    expect(traceSight(ctx, vec(5, 20), EYE, vec(16, 20), TARGET_HEIGHT.prone).clear).toBe(false);
  });

  it('sees through a window gap at eye level but not through the wall beside it', () => {
    const level = buildTestLevel({}, (b) => b.addWall(vec(15, 0), vec(15, 40), { height: 3, windowEvery: 2 }));
    const ctx = ctxFor(level);
    const grid = new Grid(level);
    const isWindowRow = (z: number) => level.occluders.highTop[grid.cellAt(vec(15, z))]! > 0;
    const windowZ = [...Array(80).keys()].map((i) => i * 0.5 + 0.25).find(isWindowRow)!;
    const wallZ = [...Array(80).keys()].map((i) => i * 0.5 + 0.25).find((z) => !isWindowRow(z) && level.occluders.lowTop[grid.cellAt(vec(15, z))]! > 0)!;
    expect(traceSight(ctx, vec(5, windowZ), EYE, vec(25, windowZ), TARGET_HEIGHT.stand).clear).toBe(true);
    expect(traceSight(ctx, vec(5, wallZ), EYE, vec(25, wallZ), TARGET_HEIGHT.stand).clear).toBe(false);
  });

  it('is blocked by a hill between observer and target', () => {
    const level = buildTestLevel({ height: (x) => Math.max(0, 4 - Math.abs(x - 20)) });
    const ctx = ctxFor(level);
    expect(traceSight(ctx, vec(5, 20), EYE, vec(35, 20), TARGET_HEIGHT.stand).clear).toBe(false);
  });

  it('is blocked by a closed door and by smoke', () => {
    const level = buildTestLevel();
    const ctx = ctxFor(level);
    const doorCells = ctx.grid.cellsInRadius(vec(15, 20), 0.6);
    ctx.dynamic.block(doorCells, { occlusion: 2.2 });
    expect(traceSight(ctx, vec(5, 20), EYE, vec(30, 20), TARGET_HEIGHT.stand).clear).toBe(false);
    const smoky = ctxFor(level, [{ pos: vec(15, 10), radius: 3, height: 3 }]);
    expect(traceSight(smoky, vec(5, 10), EYE, vec(30, 10), TARGET_HEIGHT.stand).clear).toBe(false);
  });

  it('reports vegetation concealment near the target', () => {
    const ctx = ctxFor(buildTestLevel({}, (b) => b.addConcealment(vec(25, 20), 2, 200)));
    const result = traceSight(ctx, vec(5, 20), EYE, vec(25, 20), TARGET_HEIGHT.crouch);
    expect(result.clear).toBe(true);
    expect(result.concealment).toBeGreaterThan(0.5);
  });
});

describe('visibilityFan', () => {
  it('reaches full range in the open', () => {
    const ctx = ctxFor(buildTestLevel());
    const fan = visibilityFan(ctx, vec(5, 20), EYE, 0, Math.PI / 2, 18, 7, 9);
    expect(Math.min(...fan.far)).toBeCloseTo(18, 0);
    expect(Math.min(...fan.near)).toBeCloseTo(7, 0);
  });

  it('stops at a full-height wall and agrees with the exact sight test', () => {
    const ctx = ctxFor(buildTestLevel({}, (b) => b.addWall(vec(12, 0), vec(12, 40), { height: 3 })));
    const fan = visibilityFan(ctx, vec(5, 20), EYE, 0, 0.2, 18, 7, 3);
    const mid = fan.far[1]!;
    expect(mid).toBeLessThan(7.5);
    // Just inside the drawn cone is visible; just beyond the wall is not.
    expect(traceSight(ctx, vec(5, 20), EYE, vec(5 + mid - 0.6, 20), TARGET_HEIGHT.stand).clear).toBe(true);
    expect(traceSight(ctx, vec(5, 20), EYE, vec(13, 20), TARGET_HEIGHT.stand).clear).toBe(false);
  });

  it('never draws a cone shorter than what the guard can actually see', () => {
    // Low cover: standing targets beyond it are visible to the exact test, so the fan must include them.
    const ctx = ctxFor(buildTestLevel({}, (b) => b.addWall(vec(10, 0), vec(10, 40), { height: 1.4 })));
    const fan = visibilityFan(ctx, vec(5, 20), EYE, 0, 0.1, 18, 7, 3);
    for (let x = 6; x <= 22; x += 1) {
      if (traceSight(ctx, vec(5, 20), EYE, vec(x, 20), TARGET_HEIGHT.stand).clear) {
        expect(fan.far[1]! + 0.5).toBeGreaterThanOrEqual(x - 5);
      }
    }
  });
});
