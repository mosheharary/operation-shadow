import type { Vec2 } from '../core/math';
import type { DynamicGrid } from '../level/dynamic';
import type { Grid } from '../level/grid';
import type { LevelData } from '../level/types';
import { traverseCells } from '../nav/pathfinder';

export interface SoundContext {
  level: LevelData;
  grid: Grid;
  dynamic: DynamicGrid;
}

/** Attenuation per wall the sound passes through (each contiguous run of blocking cells). */
export const WALL_DB = 15;
export const MAX_WALL_DB = 45;
/** Extra loss when terrain (a ridge or cliff edge) blocks the direct line. */
export const TERRAIN_DB = 10;
const EAR_HEIGHT = 1.2;

/** Distance loss in open air: −6 dB per doubling of distance, referenced to 1 m. */
export const distanceLoss = (metres: number): number => 20 * Math.log10(Math.max(1, metres));

/** Radius in open ground at which a sound of `db` (at 1 m) falls to the noise floor. */
export const audibleRadius = (db: number, floorDb: number): number => (db <= floorDb ? 0 : 10 ** ((db - floorDb) / 20));

/** Losses from walls, closed doors and terrain between two points (excluding distance loss). */
export function obstructionLoss(ctx: SoundContext, from: Vec2, to: Vec2): number {
  const { level, grid, dynamic } = ctx;
  const o = level.occluders;
  const fromY = grid.heightAt(from) + EAR_HEIGHT;
  const toY = grid.heightAt(to) + EAR_HEIGHT;
  const startCell = grid.cellAt(from);
  const endCell = grid.cellAt(to);
  let loss = 0;
  let inWall = false;
  let terrainBlocked = false;
  traverseCells(grid, from, to, (cell, tEnter, tExit) => {
    if (cell === startCell || cell === endCell) return true;
    const ground = level.cellHeight[cell]!;
    const y = fromY + (toY - fromY) * ((tEnter + tExit) / 2);
    const coversEar =
      (o.lowTop[cell]! > 0 && ground + o.lowBottom[cell]! <= y && ground + o.lowTop[cell]! >= y) ||
      (o.highTop[cell]! > 0 && ground + o.highBottom[cell]! <= y && ground + o.highTop[cell]! >= y);
    const door = dynamic.soundDamping[cell]!;
    if (coversEar || door > 0) {
      if (!inWall) loss += coversEar ? WALL_DB : door;
      inWall = true;
    } else {
      inWall = false;
    }
    if (!terrainBlocked && y < ground - 0.1) terrainBlocked = true;
    return true;
  });
  return Math.min(MAX_WALL_DB, loss) + (terrainBlocked ? TERRAIN_DB : 0);
}

/** Sound pressure level (dB) of a source as heard at the listener. */
export function receivedLevel(ctx: SoundContext, source: Vec2, sourceDb: number, listener: Vec2): number {
  const d = Math.hypot(listener.x - source.x, listener.z - source.z);
  return sourceDb - distanceLoss(d) - obstructionLoss(ctx, source, listener);
}
