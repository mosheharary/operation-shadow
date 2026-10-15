import { distance, type Vec2 } from '../core/math';
import { Grid } from './grid';
import {
  CellFlag,
  type LevelData,
  type LightDef,
  type NavLink,
  type NavLinkKind,
  type PatrolRouteDef,
  type PostDef,
  type PropDef,
  type SlotDef,
  type StructureDef,
  Surface,
  type ZoneDef,
} from './types';
import type { ObjectSpawn } from '../sim/mission';

export interface LevelBuilderOptions {
  id: string;
  templateId: string;
  seed: number;
  generatorVersion: string;
  width: number;
  depth: number;
  cellSize?: number;
  seaLevel?: number;
}

export interface WallOptions {
  height: number;
  thickness?: number;
  /** Transparent barrier (chain-link fence): blocks movement, not sight or sound. */
  transparent?: boolean;
  /** Window gaps every n metres along the wall (sight passes between 1.0 m and 1.9 m). */
  windowEvery?: number;
  /** Positions along the wall that stay open (doorways). */
  openings?: Vec2[];
  openingWidth?: number;
  regionId?: number;
}

const STEEP_DELTA = 0.45; // height change across one 0.5 m cell above which ground is too steep to walk

/**
 * Mutable construction helper for LevelData. Generators and tests paint terrain, walls and
 * features into it, then call finalize() once.
 */
export class LevelBuilder {
  readonly level: LevelData;
  readonly grid: Grid;
  private finalized = false;
  /** Pier decks are exempt from the steepness check against the water below. */
  private readonly deckCells = new Set<number>();

  constructor(options: LevelBuilderOptions) {
    const cellSize = options.cellSize ?? 0.5;
    const cols = Math.round(options.width / cellSize);
    const rows = Math.round(options.depth / cellSize);
    const cells = cols * rows;
    const hfStep = 1;
    const vx = Math.floor(options.width / hfStep) + 1;
    const vz = Math.floor(options.depth / hfStep) + 1;
    this.level = {
      version: 1,
      id: options.id,
      templateId: options.templateId,
      seed: options.seed,
      generatorVersion: options.generatorVersion,
      width: options.width,
      depth: options.depth,
      cellSize,
      cols,
      rows,
      heightfield: new Float32Array(vx * vz),
      heightfieldStep: hfStep,
      cellHeight: new Float32Array(cells),
      surface: new Uint8Array(cells).fill(Surface.Grass),
      flags: new Uint8Array(cells).fill(CellFlag.Walkable),
      occluders: {
        lowBottom: new Float32Array(cells),
        lowTop: new Float32Array(cells),
        highBottom: new Float32Array(cells),
        highTop: new Float32Array(cells),
      },
      concealment: new Uint8Array(cells),
      staticLight: new Uint8Array(cells),
      noiseFloor: new Uint8Array(cells),
      region: new Uint16Array(cells),
      seaLevel: options.seaLevel ?? 0,
      links: [],
      structures: [],
      props: [],
      lights: [],
      routes: [],
      posts: [],
      zones: [],
      slots: [],
      searchNodes: [],
      fixtures: [],
    };
    this.grid = new Grid(this.level);
  }

  // ── Iteration helpers ───────────────────────────────────────────────────────────────────────

  /** Calls fn for every cell whose centre lies in the axis-aligned rectangle [min, max]. */
  forRect(min: Vec2, max: Vec2, fn: (cell: number) => void): void {
    const cs = this.level.cellSize;
    const c0 = Math.max(0, Math.ceil(min.x / cs - 0.5));
    const c1 = Math.min(this.level.cols - 1, Math.floor(max.x / cs - 0.5));
    const r0 = Math.max(0, Math.ceil(min.z / cs - 0.5));
    const r1 = Math.min(this.level.rows - 1, Math.floor(max.z / cs - 0.5));
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) fn(this.grid.index(c, r));
  }

  forCircle(center: Vec2, radius: number, fn: (cell: number, d: number) => void): void {
    for (const cell of this.grid.cellsInRadius(center, radius)) fn(cell, distance(center, this.grid.center(cell)));
  }

  /** Cells covered by a thick line segment. */
  forSegment(a: Vec2, b: Vec2, thickness: number, fn: (cell: number, along: number) => void): void {
    const len = distance(a, b);
    const steps = Math.max(1, Math.ceil(len / (this.level.cellSize * 0.5)));
    const seen = new Set<number>();
    const half = thickness / 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      for (const cell of this.grid.cellsInRadius(p, Math.max(half, this.level.cellSize * 0.5))) {
        if (!seen.has(cell)) {
          seen.add(cell);
          fn(cell, t * len);
        }
      }
    }
  }

  // ── Terrain ─────────────────────────────────────────────────────────────────────────────────

  /** Samples a height function at every heightfield vertex and cell centre. */
  setHeight(fn: (x: number, z: number) => number): this {
    const { heightfield, heightfieldStep, width, depth, cellHeight } = this.level;
    const vx = Math.floor(width / heightfieldStep) + 1;
    const vz = Math.floor(depth / heightfieldStep) + 1;
    for (let z = 0; z < vz; z += 1) for (let x = 0; x < vx; x += 1) heightfield[z * vx + x] = fn(x * heightfieldStep, z * heightfieldStep);
    for (let cell = 0; cell < cellHeight.length; cell += 1) {
      const c = this.grid.center(cell);
      cellHeight[cell] = this.grid.heightAt(c);
    }
    return this;
  }

  /** Flattens the heightfield (and cell heights) inside a rectangle, e.g. under a building. */
  flatten(min: Vec2, max: Vec2, height: number): this {
    const { heightfield, heightfieldStep, width, depth } = this.level;
    const vx = Math.floor(width / heightfieldStep) + 1;
    const vz = Math.floor(depth / heightfieldStep) + 1;
    const x0 = Math.max(0, Math.floor(min.x / heightfieldStep));
    const x1 = Math.min(vx - 1, Math.ceil(max.x / heightfieldStep));
    const z0 = Math.max(0, Math.floor(min.z / heightfieldStep));
    const z1 = Math.min(vz - 1, Math.ceil(max.z / heightfieldStep));
    for (let z = z0; z <= z1; z += 1) for (let x = x0; x <= x1; x += 1) heightfield[z * vx + x] = height;
    this.forRect({ x: min.x - 1, z: min.z - 1 }, { x: max.x + 1, z: max.z + 1 }, (cell) => {
      this.level.cellHeight[cell] = this.grid.heightAt(this.grid.center(cell));
    });
    return this;
  }

  /** Overrides walkable deck height for cells (piers over water) without touching the terrain. */
  setDeck(min: Vec2, max: Vec2, height: number, surface: Surface): this {
    this.forRect(min, max, (cell) => {
      this.level.cellHeight[cell] = height;
      this.level.surface[cell] = surface;
      this.level.flags[cell] = (this.level.flags[cell]! | CellFlag.Walkable) & ~(CellFlag.Deep | CellFlag.Shallow | CellFlag.Steep);
      this.deckCells.add(cell);
    });
    return this;
  }

  paintSurface(min: Vec2, max: Vec2, surface: Surface): this {
    this.forRect(min, max, (cell) => this.setSurface(cell, surface));
    return this;
  }

  paintSurfaceCircle(center: Vec2, radius: number, surface: Surface): this {
    this.forCircle(center, radius, (cell) => this.setSurface(cell, surface));
    return this;
  }

  setSurface(cell: number, surface: Surface): void {
    const { flags } = this.level;
    this.level.surface[cell] = surface;
    let f = flags[cell]! & ~(CellFlag.Prints | CellFlag.Shallow | CellFlag.Deep);
    if (surface === Surface.Sand || surface === Surface.Snow || surface === Surface.Mud) f |= CellFlag.Prints;
    if (surface === Surface.ShallowWater) f |= CellFlag.Shallow | CellFlag.Walkable;
    if (surface === Surface.DeepWater) f = (f | CellFlag.Deep) & ~CellFlag.Walkable;
    flags[cell] = f;
  }

  setBlocked(min: Vec2, max: Vec2, blocked = true): this {
    this.forRect(min, max, (cell) => this.blockCell(cell, blocked));
    return this;
  }

  blockCell(cell: number, blocked = true): void {
    if (blocked) this.level.flags[cell]! &= ~CellFlag.Walkable;
    else this.level.flags[cell]! |= CellFlag.Walkable;
  }

  markIndoor(min: Vec2, max: Vec2, regionId: number): this {
    this.forRect(min, max, (cell) => {
      this.level.flags[cell]! |= CellFlag.Indoor;
      this.level.region[cell] = regionId;
    });
    return this;
  }

  markExtraction(min: Vec2, max: Vec2): this {
    this.forRect(min, max, (cell) => {
      this.level.flags[cell]! |= CellFlag.Extraction;
    });
    return this;
  }

  setNoiseFloor(center: Vec2, radius: number, db: number): this {
    this.forCircle(center, radius, (cell) => {
      this.level.noiseFloor[cell] = Math.max(this.level.noiseFloor[cell]!, Math.round(db));
    });
    return this;
  }

  addConcealment(center: Vec2, radius: number, value: number): this {
    this.forCircle(center, radius, (cell, d) => {
      const v = Math.round(value * (1 - (d / radius) * 0.5));
      this.level.concealment[cell] = Math.min(255, Math.max(this.level.concealment[cell]!, v));
    });
    return this;
  }

  // ── Occluders ───────────────────────────────────────────────────────────────────────────────

  /** Solid block (e.g. crate stack or rock): blocks movement and sight up to `height`. */
  addSolid(min: Vec2, max: Vec2, height: number): this {
    this.forRect(min, max, (cell) => {
      this.blockCell(cell);
      this.setOccluder(cell, 0, height);
    });
    return this;
  }

  addSolidCircle(center: Vec2, radius: number, height: number): this {
    this.forCircle(center, radius, (cell) => {
      this.blockCell(cell);
      this.setOccluder(cell, 0, height);
    });
    return this;
  }

  setOccluder(cell: number, bottom: number, top: number, high?: { bottom: number; top: number }): void {
    const o = this.level.occluders;
    o.lowBottom[cell] = bottom;
    o.lowTop[cell] = Math.max(o.lowTop[cell]!, top);
    if (high) {
      o.highBottom[cell] = high.bottom;
      o.highTop[cell] = high.top;
    }
  }

  /** Straight wall or fence between two points. Openings stay walkable and unoccluded. Returns the blocked cells. */
  addWall(a: Vec2, b: Vec2, options: WallOptions): number[] {
    const thickness = options.thickness ?? 0.4;
    const openingHalf = (options.openingWidth ?? 1.2) / 2;
    const blocked: number[] = [];
    this.forSegment(a, b, thickness, (cell, along) => {
      const c = this.grid.center(cell);
      if (options.openings?.some((o) => distance(o, c) <= openingHalf)) return;
      this.blockCell(cell);
      blocked.push(cell);
      if (options.regionId) this.level.region[cell] = options.regionId;
      if (options.transparent) return;
      const isWindow = options.windowEvery !== undefined && Math.floor(along / options.windowEvery) % 2 === 1 && options.height > 2.2;
      if (isWindow) this.setOccluder(cell, 0, 1.0, { bottom: 1.9, top: options.height });
      else this.setOccluder(cell, 0, options.height);
    });
    return blocked;
  }

  /** Rectangular building shell with doorways; interior is walkable and indoor. */
  addBuildingShell(
    def: Omit<StructureDef, 'pos' | 'size'> & { min: Vec2; max: Vec2 },
    options: { windowEvery?: number; regionId: number },
  ): StructureDef {
    const { min, max } = def;
    const height = def.height;
    const doors = def.doors ?? [];
    const corners: Vec2[] = [min, { x: max.x, z: min.z }, max, { x: min.x, z: max.z }];
    this.markIndoor({ x: min.x + 0.25, z: min.z + 0.25 }, { x: max.x - 0.25, z: max.z - 0.25 }, options.regionId);
    for (let i = 0; i < 4; i += 1) {
      this.addWall(corners[i]!, corners[(i + 1) % 4]!, {
        height,
        thickness: 0.35,
        openings: doors,
        openingWidth: 1.2,
        regionId: options.regionId,
        ...(options.windowEvery ? { windowEvery: options.windowEvery } : {}),
      });
    }
    const structure: StructureDef = {
      ...def,
      pos: { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2 },
      size: { x: max.x - min.x, z: max.z - min.z },
      regionId: options.regionId,
    };
    this.level.structures.push(structure);
    return structure;
  }

  // ── Features ────────────────────────────────────────────────────────────────────────────────

  addStructure(def: StructureDef): this {
    this.level.structures.push(def);
    return this;
  }

  addProp(def: PropDef, footprintRadius = 0): this {
    this.level.props.push(def);
    if (def.solid && footprintRadius > 0) this.addSolidCircle(def.pos, footprintRadius, def.height);
    return this;
  }

  addLight(def: LightDef): this {
    this.level.lights.push(def);
    return this;
  }

  addLink(a: Vec2, b: Vec2, kind: NavLinkKind, duration: number, requires?: 'climb'): this {
    const ca = this.grid.cellAt(a);
    const cb = this.grid.cellAt(b);
    if (ca < 0 || cb < 0) throw new Error(`link ${kind} endpoint outside the map`);
    const link: NavLink = { id: `link:${this.level.links.length}`, kind, a: ca, b: cb, duration, bidirectional: true };
    if (requires) link.requires = requires;
    this.level.links.push(link);
    return this;
  }

  addRoute(def: PatrolRouteDef): this {
    this.level.routes.push(def);
    return this;
  }

  addPost(def: PostDef): this {
    this.level.posts.push(def);
    return this;
  }

  addZone(def: ZoneDef): this {
    this.level.zones.push(def);
    if (def.kind === 'extraction') this.markExtraction(def.min, def.max);
    return this;
  }

  addSlot(def: SlotDef): this {
    this.level.slots.push(def);
    return this;
  }

  addSearchNode(pos: Vec2): this {
    this.level.searchNodes.push(pos);
    return this;
  }

  addFixture(spawn: ObjectSpawn): this {
    this.level.fixtures.push(spawn);
    return this;
  }

  // ── Finalization ────────────────────────────────────────────────────────────────────────────

  /** Marks steep ground as unwalkable and bakes static lighting. Call exactly once. */
  finalize(options: { bakeLight?: (level: LevelData) => void } = {}): LevelData {
    if (this.finalized) throw new Error('LevelBuilder.finalize() called twice');
    this.finalized = true;
    const { cols, rows, cellHeight, flags } = this.level;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cell = r * cols + c;
        if ((flags[cell]! & CellFlag.Walkable) === 0 || this.deckCells.has(cell)) continue;
        const h = cellHeight[cell]!;
        let maxDelta = 0;
        const consider = (n: number) => {
          if ((flags[n]! & CellFlag.Walkable) === 0 && (flags[n]! & CellFlag.Deep) === 0) return;
          maxDelta = Math.max(maxDelta, Math.abs(cellHeight[n]! - h));
        };
        if (c + 1 < cols) consider(cell + 1);
        if (c > 0) consider(cell - 1);
        if (r + 1 < rows) consider(cell + cols);
        if (r > 0) consider(cell - cols);
        if (maxDelta > STEEP_DELTA) flags[cell] = (flags[cell]! | CellFlag.Steep) & ~CellFlag.Walkable;
      }
    }
    options.bakeLight?.(this.level);
    return this.level;
  }
}
