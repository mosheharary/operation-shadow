import type { Vec2 } from '../core/math';
import { CellFlag, type LevelData } from './types';

/** Grid helpers bound to one level. Cell indices are row * cols + col. */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;

  constructor(readonly level: LevelData) {
    this.cols = level.cols;
    this.rows = level.rows;
    this.cellSize = level.cellSize;
  }

  index(col: number, row: number): number {
    return row * this.cols + col;
  }

  col(cell: number): number {
    return cell % this.cols;
  }

  row(cell: number): number {
    return Math.floor(cell / this.cols);
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  /** Cell containing a world position, or -1 outside the map. */
  cellAt(pos: Vec2): number {
    const col = Math.floor(pos.x / this.cellSize);
    const row = Math.floor(pos.z / this.cellSize);
    return this.inBounds(col, row) ? this.index(col, row) : -1;
  }

  /** World position of a cell centre. */
  center(cell: number): Vec2 {
    return { x: (this.col(cell) + 0.5) * this.cellSize, z: (this.row(cell) + 0.5) * this.cellSize };
  }

  hasFlag(cell: number, flag: number): boolean {
    return cell >= 0 && (this.level.flags[cell]! & flag) !== 0;
  }

  isIndoor(cell: number): boolean {
    return this.hasFlag(cell, CellFlag.Indoor);
  }

  /** Bilinear ground height from the 1 m heightfield. */
  heightAt(pos: Vec2): number {
    const { heightfield, heightfieldStep, width, depth } = this.level;
    const vx = Math.floor(width / heightfieldStep) + 1;
    const vz = Math.floor(depth / heightfieldStep) + 1;
    const fx = Math.min(Math.max(pos.x / heightfieldStep, 0), vx - 1.0001);
    const fz = Math.min(Math.max(pos.z / heightfieldStep, 0), vz - 1.0001);
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const h = (x: number, z: number) => heightfield[z * vx + x] ?? 0;
    const top = h(x0, z0) * (1 - tx) + h(x0 + 1, z0) * tx;
    const bottom = h(x0, z0 + 1) * (1 - tx) + h(x0 + 1, z0 + 1) * tx;
    return top * (1 - tz) + bottom * tz;
  }

  /** The 8 neighbours of a cell (orthogonal first), within bounds. */
  neighbours(cell: number, out: number[] = []): number[] {
    out.length = 0;
    const c = this.col(cell);
    const r = this.row(cell);
    const push = (dc: number, dr: number) => {
      if (this.inBounds(c + dc, r + dr)) out.push(this.index(c + dc, r + dr));
    };
    push(1, 0);
    push(-1, 0);
    push(0, 1);
    push(0, -1);
    push(1, 1);
    push(-1, 1);
    push(1, -1);
    push(-1, -1);
    return out;
  }

  /** Cells within `radius` metres of a point (square scan filtered by distance). */
  cellsInRadius(pos: Vec2, radius: number): number[] {
    const result: number[] = [];
    const minC = Math.max(0, Math.floor((pos.x - radius) / this.cellSize));
    const maxC = Math.min(this.cols - 1, Math.floor((pos.x + radius) / this.cellSize));
    const minR = Math.max(0, Math.floor((pos.z - radius) / this.cellSize));
    const maxR = Math.min(this.rows - 1, Math.floor((pos.z + radius) / this.cellSize));
    const r2 = radius * radius;
    for (let r = minR; r <= maxR; r += 1) {
      for (let c = minC; c <= maxC; c += 1) {
        const cx = (c + 0.5) * this.cellSize - pos.x;
        const cz = (r + 0.5) * this.cellSize - pos.z;
        if (cx * cx + cz * cz <= r2) result.push(this.index(c, r));
      }
    }
    return result;
  }
}
