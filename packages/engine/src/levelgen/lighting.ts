import { distance } from '../core/math';
import { DynamicGrid } from '../level/dynamic';
import { Grid } from '../level/grid';
import type { LevelData } from '../level/types';
import { traceSight } from '../sight/los';

/**
 * Bakes lamps and lit windows into the per-cell static light map. Light only reaches cells the
 * lamp can see, so walls cast real shadows that matter for stealth. Searchlights stay dynamic.
 */
export function bakeStaticLight(level: LevelData): void {
  const grid = new Grid(level);
  const ctx = { level, grid, dynamic: new DynamicGrid(level), smoke: [] };
  const accumulated = new Float32Array(level.cols * level.rows);
  for (const light of level.lights) {
    if (light.kind === 'searchlight') continue;
    const lightY = grid.heightAt(light.pos) + light.height;
    for (const cell of grid.cellsInRadius(light.pos, light.radius)) {
      const centre = grid.center(cell);
      const falloff = 1 - distance(centre, light.pos) / light.radius;
      const value = light.intensity * falloff * falloff;
      if (value < 0.01) continue;
      if (traceSight(ctx, light.pos, lightY, centre, level.cellHeight[cell]! + 0.6).clear) accumulated[cell]! += value;
    }
  }
  for (let i = 0; i < accumulated.length; i += 1) level.staticLight[i] = Math.min(255, Math.round(accumulated[i]! * 255));
}
