import type { Vec2 } from '../core/math';
import type { DynamicGrid } from '../level/dynamic';
import { Grid } from '../level/grid';
import { CellFlag, type LevelData, type NavLink, Surface } from '../level/types';

/** Movement capabilities that decide which cells and links an agent may use. */
export interface NavProfile {
  /** May enter deep water (Marine Operator). */
  swim: boolean;
  /** May use climb links over walls and cliffs (Infiltrator). */
  climb: boolean;
}

export const WALKER: NavProfile = { swim: false, climb: false };

export interface PathPoint extends Vec2 {
  /** Set when reaching this point traverses a link from the previous point. */
  link?: NavLink;
}

export type PathFailure = 'start-outside' | 'goal-outside' | 'unreachable' | 'search-limit';

export type PathResult =
  | { ok: true; points: PathPoint[]; cost: number; adjustedGoal: boolean }
  | { ok: false; reason: PathFailure };

const SURFACE_COST: Partial<Record<Surface, number>> = {
  [Surface.Sand]: 1.15,
  [Surface.Snow]: 1.25,
  [Surface.Mud]: 1.4,
  [Surface.ShallowWater]: 1.8,
  [Surface.DeepWater]: 2.4,
};

/** Seconds of link traversal are converted to metres at walking pace for path costs. */
const WALK_SPEED = 1.6;
const SQRT2 = Math.SQRT2;
const ADJUST_RADIUS = 3;

/** Binary min-heap of cell indices keyed by f-score. */
class MinHeap {
  private cells: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  clear(): void {
    this.cells.length = 0;
    this.keys.length = 0;
  }

  push(cell: number, key: number): void {
    const { cells, keys } = this;
    let i = cells.length;
    cells.push(cell);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      cells[i] = cells[parent]!;
      keys[i] = keys[parent]!;
      i = parent;
    }
    cells[i] = cell;
    keys[i] = key;
  }

  pop(): number {
    const { cells, keys } = this;
    const top = cells[0]!;
    const lastCell = cells.pop()!;
    const lastKey = keys.pop()!;
    const n = cells.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const child = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[child]! >= lastKey) break;
        cells[i] = cells[child]!;
        keys[i] = keys[child]!;
        i = child;
      }
      cells[i] = lastCell;
      keys[i] = lastKey;
    }
    return top;
  }
}

/**
 * Deterministic grid A* with octile movement, no corner cutting, capability-aware links and
 * string-pulled output. One instance per level; reusable across queries.
 */
export class Pathfinder {
  readonly grid: Grid;
  private readonly g: Float64Array;
  private readonly parent: Int32Array;
  private readonly via: Int32Array;
  private readonly visited: Uint32Array;
  private readonly closed: Uint32Array;
  private generation = 0;
  private readonly heap = new MinHeap();
  private readonly linksByCell = new Map<number, NavLink[]>();

  constructor(
    readonly level: LevelData,
    readonly dynamic: DynamicGrid,
  ) {
    this.grid = new Grid(level);
    const cells = level.cols * level.rows;
    this.g = new Float64Array(cells);
    this.parent = new Int32Array(cells);
    this.via = new Int32Array(cells);
    this.visited = new Uint32Array(cells);
    this.closed = new Uint32Array(cells);
    level.links.forEach((link) => {
      this.addLinkFrom(link.a, link);
      if (link.bidirectional) this.addLinkFrom(link.b, link);
    });
  }

  private addLinkFrom(cell: number, link: NavLink): void {
    const list = this.linksByCell.get(cell);
    if (list) list.push(link);
    else this.linksByCell.set(cell, [link]);
  }

  passable(cell: number, profile: NavProfile): boolean {
    if (cell < 0) return false;
    const dyn = this.dynamic.movement[cell]!;
    if (dyn === 1) return false;
    const flags = this.level.flags[cell]!;
    if (flags & CellFlag.OutOfBounds) return false;
    if (dyn === 2) return true;
    if (flags & CellFlag.Walkable) return true;
    if (flags & CellFlag.Deep) return profile.swim;
    return false;
  }

  isPassableAt(pos: Vec2, profile: NavProfile): boolean {
    return this.passable(this.grid.cellAt(pos), profile);
  }

  private cellCost(cell: number): number {
    return SURFACE_COST[this.level.surface[cell] as Surface] ?? 1;
  }

  /** Nearest passable cell within `radius` metres (ties broken by cell index for determinism). */
  nearestPassable(pos: Vec2, profile: NavProfile, radius = ADJUST_RADIUS): number {
    let best = -1;
    let bestD = Infinity;
    for (const cell of this.grid.cellsInRadius(pos, radius)) {
      if (!this.passable(cell, profile)) continue;
      const c = this.grid.center(cell);
      const d = (c.x - pos.x) ** 2 + (c.z - pos.z) ** 2;
      if (d < bestD || (d === bestD && cell < best)) {
        best = cell;
        bestD = d;
      }
    }
    return best;
  }

  findPath(start: Vec2, goal: Vec2, profile: NavProfile, maxExpanded = 80_000): PathResult {
    const grid = this.grid;
    const startCell = grid.cellAt(start);
    if (startCell < 0) return { ok: false, reason: 'start-outside' };
    let goalCell = grid.cellAt(goal);
    if (goalCell < 0) return { ok: false, reason: 'goal-outside' };
    let adjustedGoal = false;
    if (!this.passable(goalCell, profile)) {
      goalCell = this.nearestPassable(goal, profile);
      if (goalCell < 0) return { ok: false, reason: 'unreachable' };
      adjustedGoal = true;
    }
    if (startCell === goalCell) {
      const end = adjustedGoal ? grid.center(goalCell) : goal;
      return { ok: true, points: [{ x: start.x, z: start.z }, { x: end.x, z: end.z }], cost: 0, adjustedGoal };
    }

    this.generation += 1;
    const gen = this.generation;
    const { g, parent, via, visited, closed, heap } = this;
    heap.clear();
    const goalCol = grid.col(goalCell);
    const goalRow = grid.row(goalCell);
    const cs = this.level.cellSize;
    const heuristic = (cell: number) => {
      const dx = Math.abs(grid.col(cell) - goalCol);
      const dz = Math.abs(grid.row(cell) - goalRow);
      return (Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)) * cs;
    };

    g[startCell] = 0;
    parent[startCell] = -1;
    via[startCell] = -1;
    visited[startCell] = gen;
    heap.push(startCell, heuristic(startCell));
    let expanded = 0;
    const cols = this.level.cols;

    while (heap.size > 0) {
      const cell = heap.pop();
      if (closed[cell] === gen) continue;
      closed[cell] = gen;
      if (cell === goalCell) return this.buildResult(start, goal, startCell, goalCell, adjustedGoal, profile);
      if (++expanded > maxExpanded) return { ok: false, reason: 'search-limit' };

      const c = cell % cols;
      const r = (cell - c) / cols;
      for (let dir = 0; dir < 8; dir += 1) {
        const dc = DIRS[dir]![0];
        const dr = DIRS[dir]![1];
        const nc = c + dc;
        const nr = r + dr;
        if (!grid.inBounds(nc, nr)) continue;
        const next = nr * cols + nc;
        if (closed[next] === gen || !this.passable(next, profile)) continue;
        const diagonal = dc !== 0 && dr !== 0;
        if (diagonal && (!this.passable(r * cols + nc, profile) || !this.passable(nr * cols + c, profile))) continue;
        const step = (diagonal ? SQRT2 : 1) * cs * this.cellCost(next);
        this.relax(cell, next, g[cell]! + step, -1, heuristic, gen);
      }
      const links = this.linksByCell.get(cell);
      if (links) {
        for (const link of links) {
          if (link.requires === 'climb' && !profile.climb) continue;
          const next = link.a === cell ? link.b : link.a;
          if (closed[next] === gen || !this.passable(next, profile)) continue;
          this.relax(cell, next, g[cell]! + link.duration * WALK_SPEED, this.level.links.indexOf(link), heuristic, gen);
        }
      }
    }
    return { ok: false, reason: 'unreachable' };
  }

  private relax(from: number, to: number, cost: number, linkIndex: number, heuristic: (c: number) => number, gen: number): void {
    if (this.visited[to] === gen && cost >= this.g[to]!) return;
    this.visited[to] = gen;
    this.g[to] = cost;
    this.parent[to] = from;
    this.via[to] = linkIndex;
    this.heap.push(to, cost + heuristic(to));
  }

  private buildResult(start: Vec2, goal: Vec2, startCell: number, goalCell: number, adjustedGoal: boolean, profile: NavProfile): PathResult {
    const cells: number[] = [];
    const links: number[] = [];
    for (let cell = goalCell; cell !== -1; cell = this.parent[cell]!) {
      cells.push(cell);
      links.push(this.via[cell]!);
      if (cell === startCell) break;
    }
    cells.reverse();
    links.reverse();

    const points: PathPoint[] = [{ x: start.x, z: start.z }];
    // String pulling within link-free runs.
    let anchor = 0;
    let anchorPos: Vec2 = start;
    let i = 1;
    while (i < cells.length) {
      if (links[i]! >= 0) {
        // The link endpoint is mandatory: emit the cell before the link (if not the anchor) and the link target.
        if (i - 1 > anchor) points.push(this.grid.center(cells[i - 1]!));
        const target = this.grid.center(cells[i]!);
        points.push({ ...target, link: this.level.links[links[i]!]! });
        anchor = i;
        anchorPos = target;
        i += 1;
        continue;
      }
      // Extend as far as a straight walk stays valid and no link interrupts.
      let farthest = i;
      for (let j = i + 1; j < cells.length && links[j]! < 0; j += 1) {
        const candidate = j === cells.length - 1 && !adjustedGoal ? goal : this.grid.center(cells[j]!);
        if (!this.straightWalkable(anchorPos, candidate, profile, this.maxCost(cells, anchor, j))) break;
        farthest = j;
      }
      const isLast = farthest === cells.length - 1;
      const pos = isLast && !adjustedGoal ? goal : this.grid.center(cells[farthest]!);
      points.push({ x: pos.x, z: pos.z });
      anchor = farthest;
      anchorPos = pos;
      i = farthest + 1;
    }
    const last = points[points.length - 1]!;
    if (adjustedGoal) {
      const c = this.grid.center(goalCell);
      if (last.x !== c.x || last.z !== c.z) points.push(c);
    }
    let cost = 0;
    for (let k = 1; k < points.length; k += 1) cost += Math.hypot(points[k]!.x - points[k - 1]!.x, points[k]!.z - points[k - 1]!.z);
    return { ok: true, points, cost, adjustedGoal };
  }

  private maxCost(cells: number[], from: number, to: number): number {
    let max = 1;
    for (let k = from; k <= to; k += 1) max = Math.max(max, this.cellCost(cells[k]!));
    return max;
  }

  /** True when every cell crossed by the segment is passable and no costlier than `maxCost`. */
  straightWalkable(a: Vec2, b: Vec2, profile: NavProfile, maxCost = Infinity): boolean {
    let ok = true;
    traverseCells(this.grid, a, b, (cell) => {
      if (!this.passable(cell, profile) || this.cellCost(cell) > maxCost + 1e-9) {
        ok = false;
        return false;
      }
      return true;
    });
    return ok;
  }
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * Visits every grid cell crossed by the segment a→b (Amanatides–Woo), in order. Stops early if
 * the visitor returns false. The visitor also receives the segment parameters where the ray
 * enters and leaves the cell.
 */
export function traverseCells(
  grid: Grid,
  a: Vec2,
  b: Vec2,
  visit: (cell: number, tEnter: number, tExit: number) => boolean,
): void {
  const cs = grid.cellSize;
  let col = Math.floor(a.x / cs);
  let row = Math.floor(a.z / cs);
  const endCol = Math.floor(b.x / cs);
  const endRow = Math.floor(b.z / cs);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const stepC = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepR = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaC = stepC !== 0 ? Math.abs(cs / dx) : Infinity;
  const tDeltaR = stepR !== 0 ? Math.abs(cs / dz) : Infinity;
  let tMaxC = stepC > 0 ? ((col + 1) * cs - a.x) / dx : stepC < 0 ? (col * cs - a.x) / dx : Infinity;
  let tMaxR = stepR > 0 ? ((row + 1) * cs - a.z) / dz : stepR < 0 ? (row * cs - a.z) / dz : Infinity;
  let tEnter = 0;
  const maxSteps = Math.abs(endCol - col) + Math.abs(endRow - row) + 2;
  for (let i = 0; i < maxSteps; i += 1) {
    const tExit = Math.min(1, tMaxC, tMaxR);
    if (grid.inBounds(col, row) && !visit(grid.index(col, row), tEnter, tExit)) return;
    if (col === endCol && row === endRow) return;
    if (tMaxC < tMaxR) {
      tEnter = tMaxC;
      tMaxC += tDeltaC;
      col += stepC;
    } else {
      tEnter = tMaxR;
      tMaxR += tDeltaR;
      row += stepR;
    }
    if (tEnter > 1) return;
  }
}
