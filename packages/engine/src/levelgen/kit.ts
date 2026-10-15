import { distance, vec, type Vec2 } from '../core/math';
import type { Rng } from '../core/rng';
import type { LevelBuilder } from '../level/builder';
import type { PropKind, StructureDef, Surface } from '../level/types';

export interface Rect {
  min: Vec2;
  max: Vec2;
}

export const inRect = (p: Vec2, r: Rect, margin = 0) =>
  p.x >= r.min.x - margin && p.x <= r.max.x + margin && p.z >= r.min.z - margin && p.z <= r.max.z + margin;

export const NORTH = -Math.PI / 2;
export const SOUTH = Math.PI / 2;
export const WEST = Math.PI;
export const EAST = 0;

export interface BuildingOptions {
  height: number;
  material: StructureDef['material'];
  roof: NonNullable<StructureDef['roof']>;
  doors: Vec2[];
  floor: Surface;
  floorHeight?: number;
  windowEvery?: number;
  locked?: number[];
  doorWidth?: number[];
}

/**
 * Shared building blocks for the coastal, alpine, rail and training templates: buildings with
 * door fixtures and search nodes, lamps, hiding containers and clutter.
 */
export class LevelKit {
  private region = 1;
  readonly doorFronts: Vec2[] = [];
  readonly buildingRects: Rect[] = [];
  private propId = 0;

  constructor(
    readonly b: LevelBuilder,
    readonly rng: Rng,
  ) {}

  building(id: string, kind: StructureDef['kind'], rect: Rect, opts: BuildingOptions): number {
    const b = this.b;
    const centre = vec((rect.min.x + rect.max.x) / 2, (rect.min.z + rect.max.z) / 2);
    const floorHeight = opts.floorHeight ?? b.grid.heightAt(centre);
    b.flatten(vec(rect.min.x - 0.6, rect.min.z - 0.6), vec(rect.max.x + 0.6, rect.max.z + 0.6), floorHeight);
    b.addBuildingShell(
      { id, kind, min: rect.min, max: rect.max, rotation: 0, baseHeight: floorHeight, height: opts.height, material: opts.material, roof: opts.roof, doors: opts.doors },
      { regionId: this.region, ...(opts.windowEvery ? { windowEvery: opts.windowEvery } : {}) },
    );
    this.region += 1;
    b.paintSurface(vec(rect.min.x + 0.3, rect.min.z + 0.3), vec(rect.max.x - 0.3, rect.max.z - 0.3), opts.floor);
    opts.doors.forEach((pos, i) => {
      b.addFixture({ type: 'door', id: `door:${id}:${i}`, pos, locked: opts.locked?.includes(i) ?? false, width: opts.doorWidth?.[i] ?? 1.2 });
      this.doorFronts.push(
        vec(pos.x + (pos.x <= rect.min.x ? -1.6 : pos.x >= rect.max.x ? 1.6 : 0), pos.z + (pos.z <= rect.min.z ? -1.6 : pos.z >= rect.max.z ? 1.6 : 0)),
      );
    });
    for (const corner of [rect.min, vec(rect.max.x, rect.min.z), rect.max, vec(rect.min.x, rect.max.z)]) {
      b.addSearchNode(vec(corner.x + (corner.x === rect.min.x ? -1.2 : 1.2), corner.z + (corner.z === rect.min.z ? -1.2 : 1.2)));
    }
    this.buildingRects.push(rect);
    return floorHeight;
  }

  lamp(id: string, pos: Vec2): void {
    this.b.addLight({ id: `light-${id}`, kind: 'lamp', pos, height: 4, radius: 9, intensity: 0.85, color: '#ffcf8a' });
    this.b.addProp({ id: `lamp-${id}`, kind: 'lamp-post', pos, rotation: 0, scale: 1, height: 4, solid: false });
  }

  container(id: string, pos: Vec2, capacity: number, prop: PropKind): void {
    this.b.addFixture({ type: 'container', id: `container:${id}`, pos, capacity });
    this.b.addProp({ id: `prop-${id}`, kind: prop, pos, rotation: this.rng.range(0, Math.PI * 2), scale: 1, height: prop === 'net' ? 0.6 : 1.1, solid: false });
    this.b.addSearchNode(vec(pos.x + 1.3, pos.z));
  }

  prop(kind: PropKind, pos: Vec2, opts: { solid?: boolean; scale?: number; rotation?: number; height?: number; radius?: number } = {}): void {
    const solid = opts.solid ?? true;
    this.b.addProp(
      {
        id: `prop-${kind}-${this.propId++}`,
        kind,
        pos,
        rotation: opts.rotation ?? this.rng.range(0, Math.PI * 2),
        scale: opts.scale ?? this.rng.range(0.85, 1.1),
        height: opts.height ?? 1.1,
        solid,
      },
      solid ? (opts.radius ?? 0.45) : 0,
    );
  }

  /** Scatters clutter around an anchor, keeping clear of doors. */
  clutter(anchor: Vec2, count: number, kinds: PropKind[], spread = 1.5): void {
    for (let i = 0; i < count; i += 1) {
      const p = vec(anchor.x + this.rng.range(-spread, spread), anchor.z + this.rng.range(-spread * 0.7, spread * 0.7));
      if (this.doorFronts.some((d) => distance(d, p) < 2.2)) continue;
      this.prop(kinds[this.rng.int(0, kinds.length)]!, p);
    }
  }

  trees(area: Rect, count: number, kind: PropKind, keepClear: Rect[], minSpacing = 3.2): Vec2[] {
    const placed: Vec2[] = [];
    for (let attempt = 0; attempt < count * 6 && placed.length < count; attempt += 1) {
      const p = vec(this.rng.range(area.min.x, area.max.x), this.rng.range(area.min.z, area.max.z));
      if (keepClear.some((r) => inRect(p, r)) || placed.some((t) => distance(t, p) < minSpacing)) continue;
      placed.push(p);
      this.b.addProp({ id: `tree-${kind}-${this.propId++}`, kind, pos: p, rotation: this.rng.range(0, 6.28), scale: this.rng.range(0.8, 1.3), height: 9, solid: true }, 0.45);
      this.b.addConcealment(p, 2.2, 90);
    }
    return placed;
  }

  fence(id: string, a: Vec2, bb: Vec2, baseHeight: number, openings?: Vec2[]): void {
    const cells = this.b.addWall(a, bb, { height: 2.4, thickness: 0.3, transparent: true, ...(openings ? { openings, openingWidth: 3.6 } : {}) });
    const mid = vec((a.x + bb.x) / 2, (a.z + bb.z) / 2);
    this.b.addFixture({ type: 'fence', id: `fence:${id}`, pos: mid, cells });
    this.b.addStructure({
      id: `fence-${id}`,
      kind: 'fence',
      pos: mid,
      size: vec(Math.abs(bb.x - a.x), Math.abs(bb.z - a.z)),
      rotation: 0,
      baseHeight,
      height: 2.4,
      material: 'chainlink',
      path: [a, bb],
      ...(openings ? { doors: openings } : {}),
    });
  }

  tower(id: string, pos: Vec2, baseHeight: number): void {
    this.b.addSolidCircle(pos, 0.6, 6);
    this.b.addStructure({ id, kind: 'watchtower', pos, size: vec(3, 3), rotation: 0, baseHeight, height: 6, material: 'wood' });
    this.b.addSearchNode(vec(pos.x + 2, pos.z + 2));
  }

  sandbags(id: string, a: Vec2, length: number, alongZ: boolean, baseHeight: number): void {
    const min = alongZ ? vec(a.x - 0.35, a.z) : vec(a.x, a.z - 0.35);
    const max = alongZ ? vec(a.x + 0.35, a.z + length) : vec(a.x + length, a.z + 0.35);
    this.b.addWall(alongZ ? vec(a.x, a.z) : vec(a.x, a.z), alongZ ? vec(a.x, a.z + length) : vec(a.x + length, a.z), { height: 1.0, thickness: 0.7 });
    this.b.addStructure({
      id,
      kind: 'sandbags',
      pos: vec((min.x + max.x) / 2, (min.z + max.z) / 2),
      size: vec(max.x - min.x, max.z - min.z),
      rotation: 0,
      baseHeight,
      height: 1,
      material: 'sandbag',
    });
  }
}
