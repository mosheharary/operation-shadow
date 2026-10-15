import type { Vec2 } from '../core/math';
import type { DynamicGrid } from '../level/dynamic';
import type { Grid } from '../level/grid';
import type { LevelData } from '../level/types';
import { traverseCells } from '../nav/pathfinder';

export interface SmokeVolume {
  pos: Vec2;
  radius: number;
  /** Top of the cloud in metres above ground. */
  height: number;
}

export interface SightContext {
  level: LevelData;
  grid: Grid;
  dynamic: DynamicGrid;
  smoke: readonly SmokeVolume[];
}

export interface SightResult {
  clear: boolean;
  /** Vegetation concealment near the target, 0..1. */
  concealment: number;
}

const CONCEALMENT_RANGE = 2.5;

function segmentHitsCircle(a: Vec2, b: Vec2, c: Vec2, r: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2)) : 0;
  const px = a.x + dx * t - c.x;
  const pz = a.z + dz * t - c.z;
  return px * px + pz * pz <= r * r;
}

/**
 * Exact 2.5D sight test between two points given as ground positions plus absolute heights.
 * Blocked by terrain, static occluder spans (walls, window frames, crates), dynamic occluders
 * (closed doors) and smoke. The observer's and target's own cells are ignored for occluders.
 */
export function traceSight(ctx: SightContext, from: Vec2, fromY: number, to: Vec2, toY: number): SightResult {
  const { level, grid, dynamic } = ctx;
  const startCell = grid.cellAt(from);
  const endCell = grid.cellAt(to);
  const total = Math.hypot(to.x - from.x, to.z - from.z);
  const o = level.occluders;
  let clear = true;
  let concealment = 0;

  traverseCells(grid, from, to, (cell, tEnter, tExit) => {
    const y0 = fromY + (toY - fromY) * tEnter;
    const y1 = fromY + (toY - fromY) * tExit;
    const yMin = Math.min(y0, y1);
    const yMax = Math.max(y0, y1);
    const ground = level.cellHeight[cell]!;
    // Terrain: the ray passes below the ground surface.
    if (cell !== startCell && cell !== endCell && yMin < ground - 0.05) {
      clear = false;
      return false;
    }
    if (cell !== startCell && cell !== endCell) {
      const lowTop = o.lowTop[cell]!;
      if (lowTop > 0 && ground + o.lowBottom[cell]! < yMax && ground + lowTop > yMin) {
        clear = false;
        return false;
      }
      const highTop = o.highTop[cell]!;
      if (highTop > 0 && ground + o.highBottom[cell]! < yMax && ground + highTop > yMin) {
        clear = false;
        return false;
      }
      const dyn = dynamic.occlusion[cell]!;
      if (dyn > 0 && ground + dyn > yMin) {
        clear = false;
        return false;
      }
    }
    if (total - tExit * total <= CONCEALMENT_RANGE) concealment = Math.max(concealment, level.concealment[cell]! / 255);
    return true;
  });

  if (clear && ctx.smoke.length > 0) {
    for (const s of ctx.smoke) {
      const groundAtSmoke = grid.heightAt(s.pos);
      if (Math.min(fromY, toY) < groundAtSmoke + s.height && segmentHitsCircle(from, to, s.pos, s.radius)) {
        clear = false;
        break;
      }
    }
  }
  return { clear, concealment };
}

/** Sight-test point heights above ground for each stance (shared by the AI and the cone display). */
export const TARGET_HEIGHT = { stand: 1.5, crouch: 0.95, prone: 0.35 } as const;

export interface VisibilityFan {
  /** Ray headings in radians. */
  angles: number[];
  /** Farthest distance at which a standing target is visible along each ray (≤ far range). */
  far: number[];
  /** Same for a prone target (≤ near range). */
  near: number[];
}

/**
 * Display cone for a guard: per-ray visible distance for standing and prone targets, computed
 * with a horizon scan over the same occluder data the AI's exact sight test uses.
 *
 * Each ray records the farthest visible point rather than the first hidden one, and stops only at
 * walls taller than the eye. Pockets just behind low cover are therefore drawn as visible: the
 * overlay may overstate what a guard sees, but never understates it.
 */
export function visibilityFan(
  ctx: SightContext,
  eye: Vec2,
  eyeY: number,
  facing: number,
  fov: number,
  farRange: number,
  nearRange: number,
  rays = 41,
): VisibilityFan {
  const { level, grid, dynamic } = ctx;
  const o = level.occluders;
  const step = level.cellSize * 0.5;
  const angles: number[] = [];
  const far: number[] = [];
  const near: number[] = [];
  const startCell = grid.cellAt(eye);

  for (let i = 0; i < rays; i += 1) {
    const angle = rays > 1 ? facing - fov / 2 + (fov * i) / (rays - 1) : facing;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let maxSlope = -Infinity;
    let lastStand = 0;
    let lastProne = 0;
    for (let d = step; d <= farRange + 1e-9; d += step) {
      const cell = grid.cellAt({ x: eye.x + dx * d, z: eye.z + dz * d });
      if (cell < 0) break;
      const ground = level.cellHeight[cell]!;
      const lowTop = o.lowTop[cell]!;
      const dyn = dynamic.occlusion[cell]!;
      if (cell !== startCell) {
        const fullWall = (lowTop > 0 && o.highTop[cell]! === 0 && ground + lowTop >= eyeY) || (dyn > 0 && ground + dyn >= eyeY);
        if (fullWall) break;
      }
      // A target standing in this cell is visible if the line from the eye clears every earlier blocker.
      if ((ground + TARGET_HEIGHT.stand - eyeY) / d >= maxSlope) lastStand = d;
      if (d <= nearRange && (ground + TARGET_HEIGHT.prone - eyeY) / d >= maxSlope) lastProne = d;
      if (cell !== startCell) {
        let top = ground;
        // A window's high span is above eye level; its sill (low span) is what blocks low targets.
        if (lowTop > 0) top = Math.max(top, ground + lowTop);
        if (dyn > 0) top = Math.max(top, ground + dyn);
        maxSlope = Math.max(maxSlope, (top - eyeY) / d);
      }
    }
    angles.push(angle);
    far.push(lastStand);
    near.push(Math.min(lastProne, lastStand));
  }
  return { angles, far, near };
}
