import { distance, vec, type Vec2 } from '../core/math';
import { Rng } from '../core/rng';
import { LevelBuilder } from '../level/builder';
import { type LevelData, type PropKind, type StructureDef, Surface } from '../level/types';
import { bakeStaticLight } from './lighting';
import { fbm, smoothstep, valueNoise } from './noise';

export const COASTAL_TEMPLATE_ID = 'coastal-harbor';
export const COASTAL_GENERATOR_VERSION = 'coastal@1';

const W = 160;
const D = 120;
const SEA = -2.6;
const QUAY = 1.9;
const PLATEAU = 9;

// cos/sin of multiples of 36°, as constants so generation never depends on Math.cos precision.
const UNIT_CIRCLE_10: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0.809017, 0.587785],
  [0.309017, 0.951057],
  [-0.309017, 0.951057],
  [-0.809017, 0.587785],
  [-1, 0],
  [-0.809017, -0.587785],
  [-0.309017, -0.951057],
  [0.309017, -0.951057],
  [0.809017, -0.587785],
];

const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const WEST = Math.PI;
const EAST = 0;

export interface CoastalOptions {
  seed: number;
  id?: string;
}

interface Rect {
  min: Vec2;
  max: Vec2;
}

const inRect = (p: Vec2, r: Rect, margin = 0) =>
  p.x >= r.min.x - margin && p.x <= r.max.x + margin && p.z >= r.min.z - margin && p.z <= r.max.z + margin;

/**
 * "Varrow Harbor" coastal template: beach and dunes, a stone quay with piers, a fishing village,
 * a ramp up to a fenced cliff-top gun battery, and a pine forest to the south. Layout is fixed;
 * the seed varies terrain detail, vegetation, clutter and props. Multiple infiltration routes:
 * the road and gate, a cliff climb from the quay, a forest climb, swimming to the piers, and
 * cutting the compound fence.
 */
export function generateCoastal(options: CoastalOptions): LevelData {
  const seed = options.seed >>> 0;
  const rng = Rng.fromSeed(seed ^ 0x5eed5eed);
  const b = new LevelBuilder({
    id: options.id ?? `coastal-${seed}`,
    templateId: COASTAL_TEMPLATE_ID,
    seed,
    generatorVersion: COASTAL_GENERATOR_VERSION,
    width: W,
    depth: D,
  });

  // ── Terrain ───────────────────────────────────────────────────────────────────────────────
  const land = (x: number, z: number) =>
    1.8 + 0.6 * (fbm(x / 40, z / 40, seed) - 0.5) + (z > 68 ? 2.4 * Math.max(0, fbm(x / 26, z / 26, seed + 3) - 0.38) : 0);
  const shore = (x: number) => 13.5 + 3 * (valueNoise(x / 14, 3.7, seed + 11) - 0.5);
  const rampHeight = (x: number) => QUAY + ((PLATEAU - QUAY) * Math.min(1, Math.max(0, (x - 92) / 26)));

  b.setHeight((x, z) => {
    let base: number;
    if (x < 66) {
      const s = shore(x);
      if (z < s) base = -0.15 + (SEA + 0.15) * Math.min(1, (s - z) / 5);
      else if (z < s + 9) base = 0.1 + (land(x, z) - 0.1) * ((z - s) / 9);
      else base = land(x, z);
    } else if (x < 118) {
      if (z < 18) base = SEA;
      else if (z < 30) base = QUAY;
      else if (z < 34) base = QUAY + (land(x, z) - QUAY) * ((z - 30) / 4);
      else base = land(x, z);
    } else {
      base = z < 3 ? SEA : land(x, z);
    }
    const plateau = smoothstep(114, 118, x) * smoothstep(2, 6, z) * (1 - smoothstep(62, 66, z));
    let h = base + (PLATEAU - base) * plateau;
    if (x >= 90 && x <= 118 && z >= 49.5 && z <= 56.5) h = Math.max(h, rampHeight(x));
    return h;
  });

  // ── Surfaces ──────────────────────────────────────────────────────────────────────────────
  b.forRect(vec(0, 0), vec(W, D), (cell) => {
    const c = b.grid.center(cell);
    const h = b.level.cellHeight[cell]!;
    let surface = Surface.Grass;
    if (h < -0.45) surface = Surface.DeepWater;
    else if (h < 0.05 && c.x < 66) surface = Surface.ShallowWater;
    else if (c.x < 66 && c.z < shore(c.x) + 8) surface = Surface.Sand;
    else if (c.x >= 66 && c.x < 114 && c.z >= 18 && c.z < 27) surface = Surface.Stone;
    else if (c.z > 70 && fbm(c.x / 9, c.z / 9, seed + 21) > 0.55) surface = Surface.Dirt;
    b.setSurface(cell, surface);
  });
  b.paintSurface(vec(18, 36), vec(112, 40), Surface.Stone); // cobbled street
  b.paintSurface(vec(66, 26), vec(72, 36), Surface.Stone); // lane to the quay
  b.paintSurface(vec(0, 51), vec(92, 55), Surface.Gravel); // coast road
  b.paintSurface(vec(90, 49.5), vec(118, 56.5), Surface.Gravel); // ramp
  b.paintSurface(vec(121, 8), vec(156, 58), Surface.Gravel); // battery compound

  // ── Piers and ladders (Marine routes) ─────────────────────────────────────────────────────
  b.setDeck(vec(76, 6), vec(79, 18), QUAY, Surface.Wood);
  b.setDeck(vec(100, 8), vec(103, 18), QUAY, Surface.Wood);
  const pier = (id: string, min: Vec2, max: Vec2): StructureDef => ({
    id,
    kind: 'pier',
    pos: vec((min.x + max.x) / 2, (min.z + max.z) / 2),
    size: vec(max.x - min.x, max.z - min.z),
    rotation: 0,
    baseHeight: SEA,
    height: QUAY,
    material: 'wood',
  });
  b.addStructure(pier('pier-a', vec(76, 6), vec(79, 18)));
  b.addStructure(pier('pier-b', vec(100, 8), vec(103, 18)));
  b.addLink(vec(77.5, 5.25), vec(77.5, 6.75), 'ladder', 2.5);
  b.addLink(vec(101.5, 7.25), vec(101.5, 8.75), 'ladder', 2.5);
  b.addLink(vec(70, 17.25), vec(70, 18.75), 'ladder', 2.5);

  // ── Buildings ─────────────────────────────────────────────────────────────────────────────
  let region = 1;
  const doorFronts: Vec2[] = [];
  const buildingRects: Rect[] = [];
  const building = (
    id: string,
    kind: StructureDef['kind'],
    rect: Rect,
    opts: {
      height: number;
      material: StructureDef['material'];
      roof: NonNullable<StructureDef['roof']>;
      doors: Vec2[];
      floor: Surface;
      floorHeight?: number;
      windowEvery?: number;
      locked?: number[];
      doorWidth?: number[];
    },
  ) => {
    const centre = vec((rect.min.x + rect.max.x) / 2, (rect.min.z + rect.max.z) / 2);
    const floorHeight = opts.floorHeight ?? b.grid.heightAt(centre);
    b.flatten(vec(rect.min.x - 0.6, rect.min.z - 0.6), vec(rect.max.x + 0.6, rect.max.z + 0.6), floorHeight);
    b.addBuildingShell(
      { id, kind, min: rect.min, max: rect.max, rotation: 0, baseHeight: floorHeight, height: opts.height, material: opts.material, roof: opts.roof, doors: opts.doors },
      { regionId: region, ...(opts.windowEvery ? { windowEvery: opts.windowEvery } : {}) },
    );
    region += 1;
    b.paintSurface(vec(rect.min.x + 0.3, rect.min.z + 0.3), vec(rect.max.x - 0.3, rect.max.z - 0.3), opts.floor);
    opts.doors.forEach((pos, i) => {
      b.addFixture({ type: 'door', id: `door:${id}:${i}`, pos, locked: opts.locked?.includes(i) ?? false, width: opts.doorWidth?.[i] ?? 1.2 });
      const out = vec(
        pos.x + (pos.x <= rect.min.x ? -1.6 : pos.x >= rect.max.x ? 1.6 : 0),
        pos.z + (pos.z <= rect.min.z ? -1.6 : pos.z >= rect.max.z ? 1.6 : 0),
      );
      doorFronts.push(out);
    });
    for (const corner of [rect.min, vec(rect.max.x, rect.min.z), rect.max, vec(rect.min.x, rect.max.z)]) {
      b.addSearchNode(vec(corner.x + (corner.x === rect.min.x ? -1.2 : 1.2), corner.z + (corner.z === rect.min.z ? -1.2 : 1.2)));
    }
    buildingRects.push(rect);
    return floorHeight;
  };

  const house = { height: 3.4, material: 'plaster' as const, roof: 'gable' as const, floor: Surface.Wood, windowEvery: 2 };
  building('house-1', 'house', { min: vec(22, 27), max: vec(28, 35) }, { ...house, doors: [vec(25, 35)], floorHeight: QUAY });
  building('house-2', 'house', { min: vec(31, 27), max: vec(37, 35) }, { ...house, material: 'stone', doors: [vec(34, 35)], floorHeight: QUAY });
  building('house-3', 'house', { min: vec(41, 27), max: vec(47, 35) }, { ...house, doors: [vec(44, 35)], floorHeight: QUAY });
  building('office', 'office', { min: vec(80, 27), max: vec(90, 35) }, {
    ...house,
    material: 'brick',
    height: 3.8,
    doors: [vec(85, 35), vec(85, 27)],
    locked: [1],
    floorHeight: QUAY,
  });
  building('warehouse', 'warehouse', { min: vec(96, 26), max: vec(108, 35) }, {
    height: 4.6,
    material: 'timber',
    roof: 'gable',
    floor: Surface.Wood,
    doors: [vec(102, 35), vec(102, 26)],
    doorWidth: [1.6, 2.4],
    floorHeight: QUAY,
  });
  building('house-4', 'house', { min: vec(24, 41), max: vec(30, 49) }, { ...house, doors: [vec(27, 41)] });
  building('house-5', 'house', { min: vec(40, 41), max: vec(46, 49) }, { ...house, material: 'stone', doors: [vec(43, 41)] });
  building('holding', 'barracks', { min: vec(58, 42), max: vec(64, 48) }, {
    height: 3.2,
    material: 'stone',
    roof: 'flat',
    floor: Surface.Stone,
    doors: [vec(61, 42)],
    locked: [0],
  });
  building('house-6', 'house', { min: vec(72, 41), max: vec(78, 49) }, { ...house, doors: [vec(75, 41)] });
  building('bunker', 'bunker', { min: vec(136, 26), max: vec(146, 34) }, {
    height: 3.2,
    material: 'concrete',
    roof: 'flat',
    floor: Surface.Concrete,
    doors: [vec(136, 30)],
    floorHeight: PLATEAU,
  });
  building('barracks', 'barracks', { min: vec(125, 44), max: vec(139, 51) }, {
    height: 3.4,
    material: 'timber',
    roof: 'gable',
    floor: Surface.Wood,
    doors: [vec(132, 44)],
    windowEvery: 2,
    floorHeight: PLATEAU,
  });
  building('radio-hut', 'radio-hut', { min: vec(149, 38), max: vec(153, 42) }, {
    height: 2.8,
    material: 'wood',
    roof: 'flat',
    floor: Surface.Wood,
    doors: [vec(149, 40)],
    floorHeight: PLATEAU,
  });
  for (const door of doorFronts) b.addSearchNode(door);

  // ── Battery fortifications ────────────────────────────────────────────────────────────────
  const compound: Rect = { min: vec(121, 8), max: vec(156, 58) };
  const gate = vec(121, 53);
  const fence = (id: string, a: Vec2, bb: Vec2, openings?: Vec2[]) => {
    const cells = b.addWall(a, bb, { height: 2.4, thickness: 0.3, transparent: true, ...(openings ? { openings, openingWidth: 3.6 } : {}) });
    const mid = vec((a.x + bb.x) / 2, (a.z + bb.z) / 2);
    b.addFixture({ type: 'fence', id: `fence:${id}`, pos: mid, cells });
    b.addStructure({
      id: `fence-${id}`,
      kind: 'fence',
      pos: mid,
      size: vec(Math.abs(bb.x - a.x), Math.abs(bb.z - a.z)),
      rotation: 0,
      baseHeight: PLATEAU,
      height: 2.4,
      material: 'chainlink',
      path: [a, bb],
      ...(openings ? { doors: openings } : {}),
    });
  };
  fence('west', compound.min, vec(compound.min.x, compound.max.z), [gate]);
  fence('north', compound.min, vec(compound.max.x, compound.min.z));
  fence('east', vec(compound.max.x, compound.min.z), compound.max);
  fence('south', vec(compound.min.x, compound.max.z), compound.max);

  const emplacement = (id: string, centre: Vec2) => {
    const r = 3.4;
    for (let i = 0; i < UNIT_CIRCLE_10.length; i += 1) {
      // Leave the southern (rear) segments open as the entrance.
      if (i === 2 || i === 3) continue;
      const [c0, s0] = UNIT_CIRCLE_10[i]!;
      const [c1, s1] = UNIT_CIRCLE_10[(i + 1) % UNIT_CIRCLE_10.length]!;
      b.addWall(vec(centre.x + r * c0, centre.z + r * s0), vec(centre.x + r * c1, centre.z + r * s1), { height: 1.1, thickness: 0.6 });
    }
    b.paintSurfaceCircle(centre, r - 0.4, Surface.Concrete);
    b.addSolidCircle(centre, 0.8, 1.6);
    b.addStructure({ id, kind: 'gun-emplacement', pos: centre, size: vec(r * 2, r * 2), rotation: NORTH, baseHeight: PLATEAU, height: 1.1, material: 'sandbag' });
    b.addProp({ id: `${id}-gun`, kind: 'gun', pos: centre, rotation: NORTH, scale: 1, height: 1.6, solid: false });
    b.addSearchNode(vec(centre.x, centre.z + r + 1.2));
  };
  emplacement('gun-1', vec(134, 14));
  emplacement('gun-2', vec(148, 16));

  const tower = (id: string, pos: Vec2) => {
    b.addSolidCircle(pos, 0.6, 6);
    b.addStructure({ id, kind: 'watchtower', pos, size: vec(3, 3), rotation: 0, baseHeight: PLATEAU, height: 6, material: 'wood' });
    b.addSearchNode(vec(pos.x + 2, pos.z + 2));
  };
  tower('tower-nw', vec(124, 11));
  tower('tower-se', vec(153, 55));

  b.addWall(vec(124, 49.5), vec(124, 51.2), { height: 1.0, thickness: 0.7 });
  b.addWall(vec(124, 55), vec(124, 56.6), { height: 1.0, thickness: 0.7 });
  b.addStructure({ id: 'sandbags-gate-n', kind: 'sandbags', pos: vec(124, 50.3), size: vec(0.7, 1.7), rotation: 0, baseHeight: PLATEAU, height: 1, material: 'sandbag' });
  b.addStructure({ id: 'sandbags-gate-s', kind: 'sandbags', pos: vec(124, 55.8), size: vec(0.7, 1.6), rotation: 0, baseHeight: PLATEAU, height: 1, material: 'sandbag' });
  b.addSolid(vec(126.6, 52), vec(129, 57), 2.6);
  b.addProp({ id: 'truck-gate', kind: 'truck', pos: vec(127.8, 54.5), rotation: SOUTH, scale: 1, height: 2.6, solid: true });
  b.addProp({ id: 'bunker-antenna', kind: 'antenna', pos: vec(144.5, 27.5), rotation: 0, scale: 1, height: 9, solid: false });

  // Infiltrator climbs: the quay cliff and the forest-side cliff, each slipping through the wire.
  b.addLink(vec(112.5, 22.5), vec(123, 22.5), 'climb', 8, 'climb');
  b.addLink(vec(128, 67.5), vec(128, 56), 'climb', 8, 'climb');

  // ── Lights ────────────────────────────────────────────────────────────────────────────────
  const lamp = (id: string, pos: Vec2) => {
    b.addLight({ id: `light-${id}`, kind: 'lamp', pos, height: 4, radius: 9, intensity: 0.85, color: '#ffcf8a' });
    b.addProp({ id: `lamp-${id}`, kind: 'lamp-post', pos, rotation: 0, scale: 1, height: 4, solid: false });
  };
  [vec(30, 38.6), vec(52, 38.6), vec(70, 38.6), vec(92, 38.6), vec(110, 38.6)].forEach((p, i) => lamp(`street-${i}`, p));
  [vec(74, 24.5), vec(94, 24.5), vec(111, 24)].forEach((p, i) => lamp(`quay-${i}`, p));
  [vec(128, 31), vec(145, 41), vec(125.2, 51.6), vec(61, 50)].forEach((p, i) => lamp(`site-${i}`, p));
  for (const id of ['house-1', 'house-3', 'office', 'house-5', 'barracks']) {
    const s = b.level.structures.find((x) => x.id === id)!;
    b.addLight({ id: `window-${id}`, kind: 'window', pos: s.pos, height: 1.5, radius: Math.max(s.size.x, s.size.z) * 0.5 + 3, intensity: 0.45, color: '#ffd9a0' });
  }
  b.addLight({ id: 'searchlight-nw', kind: 'searchlight', pos: vec(124, 11), height: 6.5, radius: 50, intensity: 1, color: '#f4f1e0' });

  // ── Fixtures: alarm network, hiding places, searchlight ───────────────────────────────────
  b.addFixture({ type: 'alarm-bell', id: 'bell:battery', pos: vec(130, 36), label: 'Battery alarm bell', sector: 'battery' });
  b.addFixture({ type: 'alarm-bell', id: 'bell:village', pos: vec(66, 40.5), label: 'Village alarm bell', sector: 'village' });
  b.addFixture({ type: 'radio', id: 'radio:battery-net', pos: vec(151.5, 40), label: 'Battery radio set', sector: 'battery' });
  b.addFixture({
    type: 'searchlight',
    id: 'searchlight:nw-tower',
    pos: vec(124, 11),
    label: 'Tower searchlight',
    sector: 'battery',
    heading: 2.84,
    sweepArc: 1.5,
    sweepPeriod: 14,
    range: 50,
  });
  const container = (id: string, pos: Vec2, capacity: number, prop: PropKind) => {
    b.addFixture({ type: 'container', id: `container:${id}`, pos, capacity });
    b.addProp({ id: `prop-${id}`, kind: prop, pos, rotation: rng.range(0, Math.PI * 2), scale: 1, height: prop === 'net' ? 0.6 : 1.1, solid: false });
    b.addSearchNode(vec(pos.x + 1.3, pos.z));
  };
  container('quay-nets', vec(86, 21.5), 1, 'net');
  container('warehouse-crates', vec(99.5, 30), 2, 'crate');
  container('alley-woodpile', vec(39, 31), 1, 'crate');
  container('barracks-crates', vec(122.8, 41.5), 1, 'crate');
  container('hedge-gap', vec(52, 63.5), 1, 'bush');

  // ── Clutter: crates, barrels, boats, rocks ────────────────────────────────────────────────
  const clutterAnchors: [Vec2, number][] = [
    [vec(90, 21), 3],
    [vec(108, 21), 3],
    [vec(110, 31), 2],
    [vec(56, 37), 2],
    [vec(20, 37), 2],
    [vec(147, 44), 3],
    [vec(130, 23), 2],
  ];
  let propId = 0;
  for (const [anchor, count] of clutterAnchors) {
    for (let i = 0; i < count; i += 1) {
      const p = vec(anchor.x + rng.range(-1.6, 1.6), anchor.z + rng.range(-1.2, 1.2));
      const kind: PropKind = rng.chance(0.5) ? 'crate' : rng.chance(0.4) ? 'fuel-barrel' : 'barrel';
      b.addProp({ id: `clutter-${propId++}`, kind, pos: p, rotation: rng.range(0, Math.PI * 2), scale: rng.range(0.9, 1.1), height: 1.1, solid: true }, 0.45);
    }
  }
  b.addProp({ id: 'insertion-boat', kind: 'rowboat', pos: vec(14, 14.2), rotation: 0.3, scale: 1.2, height: 0.8, solid: false });
  b.addProp({ id: 'fishing-boat', kind: 'fishing-boat', pos: vec(105.5, 12.5), rotation: SOUTH, scale: 1, height: 3, solid: false });
  [vec(80.2, 10), vec(80.2, 15), vec(99, 12)].forEach((p, i) => b.addProp({ id: `moored-${i}`, kind: 'rowboat', pos: p, rotation: SOUTH, scale: 1, height: 0.8, solid: false }));
  for (let i = 0; i < 9; i += 1) {
    const p = vec(rng.range(63.5, 68), rng.range(10, 21));
    b.addProp({ id: `groyne-rock-${i}`, kind: 'rock', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.8, 1.5), height: 1.2, solid: true }, 0.9);
  }
  b.addProp({ id: 'buoy-extraction', kind: 'buoy', pos: vec(9, 8), rotation: 0, scale: 1, height: 1.4, solid: false });

  // ── Vegetation and concealment ────────────────────────────────────────────────────────────
  const keepClear: Rect[] = [
    ...buildingRects.map((r) => ({ min: vec(r.min.x - 2, r.min.z - 2), max: vec(r.max.x + 2, r.max.z + 2) })),
    { min: vec(0, 50), max: vec(92, 56) },
    { min: vec(88, 48), max: vec(160, 66) },
    { min: vec(18, 35.5), max: vec(112, 40.5) },
    compound,
  ];
  const clear = (p: Vec2) => !keepClear.some((r) => inRect(p, r));
  const trees: Vec2[] = [];
  for (let attempt = 0; attempt < 900 && trees.length < 230; attempt += 1) {
    const p = vec(rng.range(2, W - 2), rng.range(68, D - 2));
    if (!clear(p) || trees.some((t) => distance(t, p) < 3.4)) continue;
    trees.push(p);
    b.addProp({ id: `tree-${trees.length}`, kind: 'tree-pine', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.8, 1.35), height: 9, solid: true }, 0.45);
    b.addConcealment(p, 2.2, 90);
  }
  // Hedgerow between the fields and the forest, with gaps.
  for (let x = 4; x < 112; x += 2.6) {
    if (valueNoise(x / 7, 9.1, seed + 31) < 0.3) continue;
    const p = vec(x + rng.range(-0.4, 0.4), 62.5 + rng.range(-0.5, 0.5));
    if (!clear(p)) continue;
    b.addProp({ id: `hedge-${Math.round(x * 10)}`, kind: 'bush', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.9, 1.3), height: 1.3, solid: false });
    b.addConcealment(p, 1.6, 215);
    if (Math.round(x) % 3 === 0) b.addSearchNode(vec(p.x, p.z - 1.5));
  }
  // Dune grass and scattered bushes behind the beach; bushes around the fields.
  for (let i = 0; i < 26; i += 1) {
    const p = vec(rng.range(4, 62), rng.range(19, 26));
    if (!clear(p)) continue;
    b.addConcealment(p, rng.range(2.5, 4.5), 150);
    b.addProp({ id: `dune-grass-${i}`, kind: 'tall-grass', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(1.5, 2.6), height: 0.9, solid: false });
  }
  for (let i = 0; i < 34; i += 1) {
    const p = vec(rng.range(2, 112), rng.range(56, 68));
    if (!clear(p)) continue;
    b.addConcealment(p, 1.5, 210);
    b.addProp({ id: `bush-${i}`, kind: 'bush', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.9, 1.4), height: 1.3, solid: false });
  }
  for (let i = 0; i < 18; i += 1) {
    const p = vec(rng.range(118, 158), rng.range(rng.chance(0.5) ? 2 : 59, rng.chance(0.5) ? 7 : 62));
    if (inRect(p, compound, 1)) continue;
    b.addProp({ id: `plateau-rock-${i}`, kind: 'rock', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.6, 1.2), height: 1, solid: true }, 0.7);
  }

  // Surf noise along the beach and against the quay wall.
  for (let x = 2; x < 66; x += 6) b.setNoiseFloor(vec(x, shore(x)), 7, 40);
  for (let x = 68; x < 114; x += 6) b.setNoiseFloor(vec(x, 18), 5, 37);

  // ── Guard posts and patrol routes ─────────────────────────────────────────────────────────
  const post = (id: string, pos: Vec2, facing: number, extra: { sweepArc?: number; sweepPeriod?: number; elevation?: number } = {}) =>
    b.addPost({ id: `post:${id}`, pos, facing, ...extra });
  post('office-inside', vec(82.3, 31), EAST, { sweepArc: 1.2, sweepPeriod: 11 });
  post('office-door', vec(85, 36.6), SOUTH, { sweepArc: 1.6, sweepPeriod: 9 });
  post('holding-door', vec(61, 40.6), NORTH, { sweepArc: 1.6, sweepPeriod: 10 });
  post('junction', vec(62, 53), WEST, { sweepArc: 1.2, sweepPeriod: 12 });
  post('pier-a-end', vec(77.5, 7.6), NORTH, { sweepArc: 1.6, sweepPeriod: 10 });
  post('warehouse-door', vec(102, 36.6), SOUTH, { sweepArc: 1.4, sweepPeriod: 10 });
  post('quay-east', vec(111.5, 21.5), WEST, { sweepArc: 1.2, sweepPeriod: 12 });
  post('gate-north', vec(122.6, 51.6), WEST, { sweepArc: 0.8, sweepPeriod: 9 });
  post('gate-south', vec(122.6, 54.6), WEST, { sweepArc: 0.8, sweepPeriod: 11 });
  post('tower-nw', vec(124, 11), 2.84, { sweepArc: 1.6, sweepPeriod: 16, elevation: 5 });
  post('tower-se', vec(153, 55), WEST, { sweepArc: 1.6, sweepPeriod: 18, elevation: 5 });
  post('bunker-door', vec(134.4, 30), WEST, { sweepArc: 1.0, sweepPeriod: 10 });
  post('bunker-radio', vec(140.5, 28.2), EAST);
  post('gun-1', vec(134, 18.4), NORTH, { sweepArc: 1.0, sweepPeriod: 14 });
  post('barracks-door', vec(132, 42.5), NORTH, { sweepArc: 1.2, sweepPeriod: 12 });

  const route = (id: string, points: Vec2[], waits: number[]) => b.addRoute({ id: `route:${id}`, points, waits, loop: true });
  route('beach', [vec(31, 20.5), vec(45, 21.5), vec(59, 20.5), vec(45, 23.5)], [4, 0, 5, 0]);
  route('street', [vec(24, 38), vec(66, 38), vec(104, 38), vec(66, 39.2)], [3, 0, 4, 0]);
  route('quay', [vec(70, 21), vec(94, 21.5), vec(108, 22.5), vec(94, 23)], [3, 2, 4, 0]);
  route('ramp', [vec(90.5, 53), vec(116.5, 53)], [6, 6]);
  route('compound-north', [vec(127, 21.5), vec(152, 21.5), vec(152, 35), vec(127, 35)], [2, 3, 2, 3]);
  route('compound-south', [vec(141, 38.5), vec(153, 47), vec(141, 55.5), vec(131, 55.5)], [2, 2, 3, 2]);
  route('forest-edge', [vec(68, 65.5), vec(108, 65.5)], [5, 5]);

  // ── Zones and slots ───────────────────────────────────────────────────────────────────────
  b.addZone({ id: 'insertion', kind: 'insertion', min: vec(6, 15.5), max: vec(18, 22), label: 'Landing beach' });
  b.addZone({ id: 'extraction', kind: 'extraction', min: vec(6, 15.5), max: vec(18, 22), label: 'Boat' });
  b.addZone({ id: 'holding', kind: 'holding', min: vec(58.7, 42.7), max: vec(63.3, 47.3), label: 'Lock-up' });
  b.addZone({ id: 'battery', kind: 'restricted', min: vec(136.4, 26.4), max: vec(145.6, 33.6), label: 'Fire-control bunker' });
  b.addZone({ id: 'battery', kind: 'sector', min: vec(113, 0), max: vec(160, 66) });
  b.addZone({ id: 'harbor', kind: 'sector', min: vec(64, 0), max: vec(113, 30) });
  b.addZone({ id: 'village', kind: 'sector', min: vec(0, 26), max: vec(113, 58) });
  b.addZone({ id: 'beach', kind: 'sector', min: vec(0, 0), max: vec(64, 26) });
  b.addZone({ id: 'south', kind: 'sector', min: vec(0, 58), max: vec(160, 120) });

  const slot = (id: string, pos: Vec2, tags: string[], indoor: boolean, facing = 0) => b.addSlot({ id: `slot:${id}`, pos, tags, indoor, facing });
  [vec(9, 17), vec(10.6, 17.6), vec(12.2, 17), vec(9.4, 19.2), vec(11, 19.8), vec(12.6, 19.2)].forEach((p, i) => slot(`insertion-${i}`, p, ['insertion'], false, 0.8));
  slot('bunker-console', vec(143, 30.5), ['objective-target', 'console', 'battery'], true);
  slot('office-desk', vec(88, 31), ['item', 'documents', 'village'], true);
  slot('holding-cell', vec(61, 45.5), ['prisoner', 'village'], true);
  slot('warehouse-floor', vec(104.5, 31), ['item', 'harbor'], true);
  slot('gun-1', vec(134, 14), ['objective-target', 'gun', 'battery'], false);
  slot('gun-2', vec(148, 16), ['objective-target', 'gun', 'battery'], false);
  slot('radio-hut', vec(151.5, 40.5), ['objective-target', 'radio', 'battery'], true);

  return b.finalize({ bakeLight: bakeStaticLight });
}
