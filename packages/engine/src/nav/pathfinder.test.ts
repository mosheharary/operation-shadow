import { describe, expect, it } from 'vitest';
import { distance, vec } from '../core/math';
import { DynamicGrid } from '../level/dynamic';
import { Surface } from '../level/types';
import { buildTestLevel } from '../testing/test-level';
import { Pathfinder, WALKER } from './pathfinder';

const SWIMMER = { swim: true, climb: false };
const CLIMBER = { swim: false, climb: true };

function pathLength(points: { x: number; z: number }[]) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1]!, points[i]!);
  return total;
}

describe('Pathfinder', () => {
  it('walks straight across open ground', () => {
    const level = buildTestLevel();
    const pf = new Pathfinder(level, new DynamicGrid(level));
    const result = pf.findPath(vec(5, 5), vec(30, 5), WALKER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toEqual([vec(5, 5), vec(30, 5)]);
    expect(result.cost).toBeCloseTo(25, 5);
  });

  it('detours around a wall instead of walking through it', () => {
    const level = buildTestLevel({}, (b) => b.addWall(vec(20, 0), vec(20, 30), { height: 3 }));
    const pf = new Pathfinder(level, new DynamicGrid(level));
    const result = pf.findPath(vec(10, 10), vec(30, 10), WALKER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Must go around the wall's southern end (z > 30).
    expect(Math.max(...result.points.map((p) => p.z))).toBeGreaterThan(30);
    for (let i = 1; i < result.points.length; i += 1) {
      expect(pf.straightWalkable(result.points[i - 1]!, result.points[i]!, WALKER)).toBe(true);
    }
  });

  it('lets only swimmers cross deep water', () => {
    const level = buildTestLevel({}, (b) => b.paintSurface(vec(15, 0), vec(25, 40), Surface.DeepWater));
    const pf = new Pathfinder(level, new DynamicGrid(level));
    expect(pf.findPath(vec(5, 20), vec(35, 20), WALKER)).toEqual({ ok: false, reason: 'unreachable' });
    const swim = pf.findPath(vec(5, 20), vec(35, 20), SWIMMER);
    expect(swim.ok).toBe(true);
  });

  it('wades through shallow water but prefers dry land when it is nearly as short', () => {
    const level = buildTestLevel({}, (b) => b.paintSurface(vec(15, 0), vec(25, 30), Surface.ShallowWater));
    const pf = new Pathfinder(level, new DynamicGrid(level));
    const result = pf.findPath(vec(5, 28), vec(35, 28), WALKER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.max(...result.points.map((p) => p.z))).toBeGreaterThan(30); // around the pond's edge
  });

  it('uses climb links only for climbers', () => {
    const level = buildTestLevel({}, (b) => {
      b.addWall(vec(0, 20), vec(40, 20), { height: 3 });
      b.addLink(vec(20, 18.5), vec(20, 21.5), 'climb', 3, 'climb');
    });
    const pf = new Pathfinder(level, new DynamicGrid(level));
    expect(pf.findPath(vec(20, 10), vec(20, 30), WALKER)).toEqual({ ok: false, reason: 'unreachable' });
    const climb = pf.findPath(vec(20, 10), vec(20, 30), CLIMBER);
    expect(climb.ok).toBe(true);
    if (!climb.ok) return;
    expect(climb.points.some((p) => p.link?.kind === 'climb')).toBe(true);
  });

  it('moves a goal inside a wall to the nearest reachable cell', () => {
    const level = buildTestLevel({}, (b) => b.addSolid(vec(18, 18), vec(22, 22), 2));
    const pf = new Pathfinder(level, new DynamicGrid(level));
    const result = pf.findPath(vec(5, 20), vec(20, 20), WALKER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.adjustedGoal).toBe(true);
    expect(distance(result.points.at(-1)!, vec(20, 20))).toBeLessThanOrEqual(3);
  });

  it('reports enclosed areas as unreachable', () => {
    const level = buildTestLevel({}, (b) => {
      b.addWall(vec(10, 10), vec(30, 10), { height: 3 });
      b.addWall(vec(30, 10), vec(30, 30), { height: 3 });
      b.addWall(vec(30, 30), vec(10, 30), { height: 3 });
      b.addWall(vec(10, 30), vec(10, 10), { height: 3 });
    });
    const pf = new Pathfinder(level, new DynamicGrid(level));
    expect(pf.findPath(vec(2, 2), vec(20, 20), WALKER)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('respects dynamic blocks such as a locked door', () => {
    const level = buildTestLevel({}, (b) => b.addWall(vec(20, 0), vec(20, 40), { height: 3, openings: [vec(20, 20)] }));
    const dynamic = new DynamicGrid(level);
    const pf = new Pathfinder(level, dynamic);
    expect(pf.findPath(vec(10, 20), vec(30, 20), WALKER).ok).toBe(true);
    const doorCells = pf.grid.cellsInRadius(vec(20, 20), 0.8);
    dynamic.block(doorCells, { occlusion: 2.2, soundDamping: 10 });
    expect(pf.findPath(vec(10, 20), vec(30, 20), WALKER)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('never cuts diagonally between two blocked cells', () => {
    const level = buildTestLevel({ width: 10, depth: 10 }, (b) => {
      b.addSolid(vec(4.5, 4), vec(5, 4.5), 2);
      b.addSolid(vec(5, 4.5), vec(5.5, 5), 2);
    });
    const pf = new Pathfinder(level, new DynamicGrid(level));
    const result = pf.findPath(vec(4.25, 4.75), vec(5.75, 4.25), WALKER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pathLength(result.points)).toBeGreaterThan(Math.hypot(1.5, 0.5) + 0.2);
  });

  it('is deterministic', () => {
    const level = buildTestLevel({}, (b) => {
      b.addWall(vec(12, 5), vec(12, 35), { height: 3 });
      b.addWall(vec(26, 0), vec(26, 30), { height: 3 });
    });
    const run = () => new Pathfinder(level, new DynamicGrid(level)).findPath(vec(3, 3), vec(37, 37), WALKER);
    expect(run()).toEqual(run());
  });
});
