import { vec, type Vec2 } from '../core/math';
import { Rng } from '../core/rng';
import { LevelBuilder } from '../level/builder';
import { CellFlag, type LevelData, type PropKind, type StructureDef, Surface } from '../level/types';
import type { GuardSlot } from '../missions/spec';
import type { Weather } from '../sim/types';
import { inRect, LevelKit, type Rect } from './kit';
import { bakeStaticLight } from './lighting';
import { fbm, smoothstep, valueNoise } from './noise';

export const SITE_GENERATOR_VERSION = 'site@1';
export const SITE_BIOMES = ['coastal', 'alpine', 'rail', 'forest', 'farmland'] as const;
export type SiteBiome = (typeof SITE_BIOMES)[number];

const SEA = -2.2;
const GROUND = 1.5;
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const EAST = 0;
const WEST = Math.PI;

// ── Compounds ─────────────────────────────────────────────────────────────────────────────────

type CompoundKind = 'barracks' | 'depot' | 'headquarters' | 'stockade' | 'radio' | 'motor-pool' | 'battery' | 'engine-shed' | 'farmstead' | 'sawmill';
type Feature = 'fuel' | 'gun' | 'trucks' | 'antenna' | 'logs' | 'water-tower' | 'hay';

interface BuildingSpec {
  role: string;
  kind: StructureDef['kind'];
  /** Width range and depth range in metres. */
  w: [number, number];
  d: [number, number];
  height: number;
  locked?: boolean;
  roof?: 'gable' | 'flat';
  material?: StructureDef['material'];
}

interface CompoundDef {
  /** Sector id and player-facing name (a patrol line reads "sweeping the <name>"). */
  name: string;
  buildings: BuildingSpec[];
  feature?: Feature;
  /** `role` is a building role, or `yard` for the outdoor feature; `what` names a thing to sabotage, else a place. */
  slots: { role: string; tag: 'objective-target' | 'item' | 'prisoner'; what: string }[];
  fence: number;
  tower: number;
  officer?: string;
  radio?: boolean;
  holding?: string;
  yard: Surface;
}

const COMPOUNDS: Record<CompoundKind, CompoundDef> = {
  barracks: {
    name: 'barracks',
    buildings: [
      { role: 'quarters', kind: 'barracks', w: [12, 16], d: [6, 8], height: 3.4 },
      { role: 'mess', kind: 'barracks', w: [9, 12], d: [6, 7], height: 3.2 },
    ],
    slots: [{ role: 'quarters', tag: 'item', what: 'barracks quarters' }],
    fence: 0.5,
    tower: 0.4,
    yard: Surface.Gravel,
  },
  depot: {
    name: 'supply depot',
    buildings: [
      { role: 'store', kind: 'warehouse', w: [13, 17], d: [8, 10], height: 5 },
      { role: 'office', kind: 'office', w: [7, 9], d: [6, 7], height: 3.4 },
    ],
    feature: 'fuel',
    slots: [
      { role: 'yard', tag: 'objective-target', what: 'fuel dump at the supply depot' },
      { role: 'office', tag: 'item', what: 'depot office' },
    ],
    fence: 0.8,
    tower: 0.5,
    yard: Surface.Gravel,
  },
  headquarters: {
    name: 'headquarters',
    buildings: [
      { role: 'office', kind: 'office', w: [12, 15], d: [7, 9], height: 4 },
      { role: 'exchange', kind: 'house', w: [8, 10], d: [7, 8], height: 3.6 },
    ],
    slots: [
      { role: 'office', tag: 'item', what: 'headquarters office' },
      { role: 'exchange', tag: 'objective-target', what: 'telephone exchange at headquarters' },
    ],
    fence: 0.7,
    tower: 0.3,
    officer: 'office',
    radio: true,
    yard: Surface.Gravel,
  },
  stockade: {
    name: 'prison camp',
    buildings: [
      { role: 'cells', kind: 'barracks', w: [8, 10], d: [6, 7], height: 3, locked: true, roof: 'flat', material: 'stone' },
      { role: 'guardroom', kind: 'barracks', w: [8, 11], d: [6, 7], height: 3.2 },
    ],
    slots: [{ role: 'cells', tag: 'prisoner', what: 'prison camp cell block' }],
    fence: 1,
    tower: 0.8,
    holding: 'cells',
    yard: Surface.Dirt,
  },
  radio: {
    name: 'radio station',
    buildings: [
      { role: 'hut', kind: 'radio-hut', w: [6, 8], d: [6, 7], height: 3.6 },
      { role: 'quarters', kind: 'barracks', w: [9, 12], d: [6, 7], height: 3.2 },
    ],
    feature: 'antenna',
    slots: [
      { role: 'hut', tag: 'objective-target', what: 'transmitter in the radio hut' },
      { role: 'quarters', tag: 'item', what: "radio operators' quarters" },
    ],
    fence: 0.9,
    tower: 0.4,
    radio: true,
    yard: Surface.Gravel,
  },
  'motor-pool': {
    name: 'motor pool',
    buildings: [
      { role: 'garage', kind: 'warehouse', w: [13, 17], d: [8, 10], height: 5 },
      { role: 'office', kind: 'office', w: [6, 8], d: [6, 7], height: 3.2 },
    ],
    feature: 'trucks',
    slots: [
      { role: 'yard', tag: 'objective-target', what: 'fuel bowser at the motor pool' },
      { role: 'office', tag: 'item', what: 'motor-pool office' },
    ],
    fence: 0.6,
    tower: 0.3,
    yard: Surface.Concrete,
  },
  battery: {
    name: 'gun battery',
    buildings: [
      { role: 'bunker', kind: 'bunker', w: [8, 10], d: [6, 8], height: 2.8, roof: 'flat', material: 'concrete' },
      { role: 'quarters', kind: 'barracks', w: [9, 12], d: [6, 7], height: 3.2 },
    ],
    feature: 'gun',
    slots: [
      { role: 'yard', tag: 'objective-target', what: 'field gun at the battery' },
      { role: 'bunker', tag: 'item', what: 'battery bunker' },
    ],
    fence: 0.7,
    tower: 0.6,
    yard: Surface.Gravel,
  },
  'engine-shed': {
    name: 'engine shed',
    buildings: [
      { role: 'shed', kind: 'warehouse', w: [15, 19], d: [8, 10], height: 5.2, material: 'brick' },
      { role: 'pit', kind: 'barracks', w: [6, 8], d: [6, 7], height: 3, locked: true, roof: 'flat', material: 'stone' },
    ],
    feature: 'water-tower',
    slots: [
      { role: 'shed', tag: 'objective-target', what: 'locomotive in the engine shed' },
      { role: 'pit', tag: 'prisoner', what: 'engine-shed pit store' },
    ],
    fence: 0.4,
    tower: 0.4,
    yard: Surface.Gravel,
  },
  farmstead: {
    name: 'farmstead',
    buildings: [
      { role: 'farmhouse', kind: 'house', w: [8, 11], d: [7, 8], height: 3.6 },
      { role: 'barn', kind: 'warehouse', w: [12, 15], d: [8, 9], height: 5, locked: true, material: 'timber' },
    ],
    feature: 'hay',
    slots: [
      { role: 'farmhouse', tag: 'item', what: 'farmhouse' },
      { role: 'barn', tag: 'prisoner', what: 'farmstead barn' },
    ],
    fence: 0.2,
    tower: 0.2,
    yard: Surface.Dirt,
  },
  sawmill: {
    name: 'sawmill',
    buildings: [
      { role: 'mill', kind: 'warehouse', w: [13, 17], d: [8, 10], height: 5, material: 'timber' },
      { role: 'office', kind: 'office', w: [6, 8], d: [6, 7], height: 3.2 },
    ],
    feature: 'logs',
    slots: [
      { role: 'mill', tag: 'objective-target', what: 'saw engine in the sawmill' },
      { role: 'office', tag: 'item', what: 'sawmill office' },
    ],
    fence: 0.3,
    tower: 0.3,
    yard: Surface.Dirt,
  },
};

/** Every sector name a site can have (the voice-bank tool records a patrol line for each). */
export const SITE_SECTOR_NAMES: readonly string[] = [...Object.values(COMPOUNDS).map((c) => c.name), 'woods', 'fields', 'road', 'outskirts'];

// ── Biomes ────────────────────────────────────────────────────────────────────────────────────

interface BiomeDef {
  special: CompoundKind;
  materials: StructureDef['material'][];
  ground: Surface;
  road: Surface;
  relief: number;
  trees: { kind: PropKind; count: number }[];
  open: string;
  weather: Weather[];
  sentence: string;
  names: string[];
}

const BIOMES: Record<SiteBiome, BiomeDef> = {
  coastal: {
    special: 'battery',
    materials: ['plaster', 'stone', 'timber'],
    ground: Surface.Grass,
    road: Surface.Gravel,
    relief: 0.7,
    trees: [
      { kind: 'tree-pine', count: 90 },
      { kind: 'tree-oak', count: 30 },
    ],
    open: 'woods',
    weather: ['fog', 'rain', 'clear'],
    sentence: 'A stretch of coast: the sea and a jetty to the north, a road behind the beach and woods inland',
    names: ['Cove', 'Point', 'Sound', 'Bay', 'Head', 'Strand'],
  },
  alpine: {
    special: 'radio',
    materials: ['timber', 'stone'],
    ground: Surface.Snow,
    road: Surface.Gravel,
    relief: 1.4,
    trees: [{ kind: 'tree-pine', count: 170 }],
    open: 'woods',
    weather: ['snow', 'fog', 'clear'],
    sentence: 'A snowbound valley cut by an icy river, crossed only by a bridge and a fallen log',
    names: ['Pass', 'Col', 'Fell', 'Crag', 'Tarn', 'Spur'],
  },
  rail: {
    special: 'engine-shed',
    materials: ['brick', 'plaster', 'timber'],
    ground: Surface.Grass,
    road: Surface.Gravel,
    relief: 0.6,
    trees: [{ kind: 'tree-oak', count: 90 }],
    open: 'woods',
    weather: ['rain', 'fog', 'clear'],
    sentence: 'A rail line through open country, its sidings lined with wagons and crossed at two level crossings',
    names: ['Junction', 'Sidings', 'Halt', 'Crossing', 'Yard'],
  },
  forest: {
    special: 'sawmill',
    materials: ['timber', 'timber', 'stone'],
    ground: Surface.Grass,
    road: Surface.Dirt,
    relief: 1,
    trees: [
      { kind: 'tree-pine', count: 170 },
      { kind: 'tree-oak', count: 90 },
    ],
    open: 'woods',
    weather: ['fog', 'rain', 'clear'],
    sentence: 'Deep woods split by a muddy logging road, with clearings cut for the camps',
    names: ['Holt', 'Woods', 'Clearing', 'Wold', 'Chase'],
  },
  farmland: {
    special: 'farmstead',
    materials: ['plaster', 'timber', 'stone', 'brick'],
    ground: Surface.Grass,
    road: Surface.Dirt,
    relief: 0.8,
    trees: [{ kind: 'tree-oak', count: 45 }],
    open: 'fields',
    weather: ['rain', 'fog', 'clear'],
    sentence: 'Rolling farmland of hedged fields, tall grass and a dirt road between the farms',
    names: ['Farm', 'Fields', 'Mill', 'Grange', 'Downs', 'Acre'],
  },
};

const PLACE_FIRST = ['Kessel', 'Morrow', 'Brann', 'Halden', 'Vire', 'Ostra', 'Grauden', 'Lisk', 'Corwen', 'Amsel', 'Dunmar', 'Fenwick', 'Harrow', 'Ilsted', 'Jarrow', 'Kelm', 'Lorne', 'Marrick', 'Norden', 'Orrin', 'Pell', 'Quarne', 'Rusk', 'Selby', 'Tamsin', 'Ulver', 'Varn', 'Wexley', 'Yarrow', 'Zell'];

export interface SiteSlot {
  id: string;
  tag: string;
  label: string;
  sector: string;
}

/** What a template needs to know about a generated site. */
export interface SiteLayout {
  name: string;
  description: string;
  sectors: string[];
  guards: GuardSlot[];
  reinforcements: { sector: string; pos: Vec2; count: number }[];
  slots: SiteSlot[];
  defaults: { timeOfDay: number; weather: Weather; parSeconds: number };
}

export const siteTemplateId = (biome: SiteBiome, seed: number) => `site-${biome}-${seed >>> 0}`;

/**
 * A whole operation site from a seed: map size and orientation, where the compounds stand and
 * which ones there are, the roads, the biome's river, railway or coast, vegetation, guard posts and
 * patrols, and the objective slots. Every seed gives a different map; the same seed always the same.
 *
 * Built in a canonical frame (approach from the south, compounds in two rows either side of a
 * central band) and then mirrored, so the approach can come from any side.
 */
export function generateSite(options: { biome: SiteBiome; seed: number; id?: string; bake?: boolean }): { level: LevelData; layout: SiteLayout } {
  const { biome } = options;
  const seed = options.seed >>> 0;
  const def = BIOMES[biome];
  const rng = Rng.fromSeed(seed ^ 0x517e);

  // ── Canonical layout ────────────────────────────────────────────────────────────────────
  const W = rng.int(140, 177);
  const seaBand = biome === 'coastal' ? 26 : rng.int(6, 12);
  const rowTop = rng.int(30, 39);
  const mid = biome === 'alpine' || biome === 'rail' ? 24 : rng.int(12, 17);
  const rowBottom = rng.int(30, 39);
  const approach = 22;
  const m0 = seaBand + rowTop;
  const m1 = m0 + mid;
  const b1 = m1 + rowBottom;
  const D = b1 + approach;
  const mirrorX = rng.chance(0.5);
  const mirrorZ = rng.chance(0.5);
  const transpose = rng.chance(0.5);
  // World size: the canonical layout may run north–south or east–west.
  const WW = transpose ? D : W;
  const DD = transpose ? W : D;

  const P = (x: number, z: number): Vec2 => {
    const mx = mirrorX ? W - x : x;
    const mz = mirrorZ ? D - z : z;
    return transpose ? vec(mz, mx) : vec(mx, mz);
  };
  /** World point back to the canonical frame (the inverse of P). */
  const Pinv = (wx: number, wz: number): Vec2 => {
    const [x, z] = transpose ? [wz, wx] : [wx, wz];
    return vec(mirrorX ? W - x : x, mirrorZ ? D - z : z);
  };
  /** A canonical footprint size (along x, along z) in world axes. */
  const S = (sx: number, sz: number): Vec2 => (transpose ? vec(sz, sx) : vec(sx, sz));
  const R = (x0: number, z0: number, x1: number, z1: number): Rect => {
    const a = P(x0, z0);
    const c = P(x1, z1);
    return { min: vec(Math.min(a.x, c.x), Math.min(a.z, c.z)), max: vec(Math.max(a.x, c.x), Math.max(a.z, c.z)) };
  };
  const face = (heading: number) => {
    let h = heading;
    if (mirrorX) h = Math.PI - h;
    if (mirrorZ) h = -h;
    // Swapping the axes reflects a heading across the diagonal.
    if (transpose) h = Math.PI / 2 - h;
    return h;
  };

  const name = `${rng.pick(PLACE_FIRST)} ${rng.pick(def.names)}`;
  const levelId = siteTemplateId(biome, seed);
  const b = new LevelBuilder({ id: options.id ?? levelId, templateId: levelId, seed, generatorVersion: SITE_GENERATOR_VERSION, width: WW, depth: DD, seaLevel: biome === 'coastal' || biome === 'alpine' ? SEA : -30 });
  const kit = new LevelKit(b, rng);

  const roadN = m0 + 3;
  const roadS = biome === 'alpine' || biome === 'rail' ? m1 - 3 : roadN;
  const singleRoad = roadN === roadS;
  const roadZ = singleRoad ? (m0 + m1) / 2 : roadN;
  const roads = singleRoad ? [roadZ] : [roadN, roadS];
  const roadNorth = singleRoad ? roadZ : roadN;
  const roadSouth = singleRoad ? roadZ : roadS;
  const riverZ = (m0 + m1) / 2;
  const riverAt = (x: number) => riverZ + 2 * (valueNoise(x / 13, 1.3, seed + 5) - 0.5);
  const shoreAt = (x: number) => seaBand - 12 + 3 * (valueNoise(x / 14, 3.7, seed + 11) - 0.5);

  // ── Terrain ─────────────────────────────────────────────────────────────────────────────
  const land = (x: number, z: number) => {
    let h = GROUND + def.relief * (fbm(x / 32, z / 32, seed) - 0.5);
    // Rougher ground in the approach and along the far edge: cover for the way in.
    const rough = smoothstep(b1 + 2, b1 + 10, z) + (biome === 'coastal' ? 0 : 1 - smoothstep(seaBand - 6, seaBand, z));
    h += 2.2 * rough * Math.max(0, fbm(x / 18, z / 18, seed + 7) - 0.42);
    return h;
  };
  b.setHeight((wx, wz) => {
    const { x, z } = Pinv(wx, wz);
    let h = land(x, z);
    if (biome === 'coastal') {
      const s = shoreAt(x);
      if (z < s) h = -0.15 + (SEA + 0.15) * Math.min(1, (s - z) / 5);
      else if (z < s + 9) h = 0.1 + (h - 0.1) * ((z - s) / 9);
    }
    if (biome === 'alpine') {
      const g = Math.abs(z - riverAt(x));
      if (g < 6) h = Math.min(h, SEA - 1.6 + (h - SEA + 1.6) * smoothstep(2.6, 6, g));
    }
    return h;
  });
  if (biome === 'rail') b.flatten(R(2, m0, W - 2, m1).min, R(2, m0, W - 2, m1).max, GROUND);

  b.forRect(vec(0, 0), vec(WW, DD), (cell) => {
    const w = b.grid.center(cell);
    const { x, z } = Pinv(w.x, w.z);
    const h = b.level.cellHeight[cell]!;
    let surface = def.ground;
    if (biome === 'coastal' || biome === 'alpine') {
      if (h < SEA + 0.1) surface = Surface.DeepWater;
      else if (biome === 'coastal' && h < 0.05) surface = Surface.ShallowWater;
      else if (biome === 'coastal' && z < shoreAt(x) + 8) surface = Surface.Sand;
      else if (biome === 'alpine' && h < SEA + 0.8) surface = Surface.Rock;
    }
    if (surface === def.ground && biome !== 'alpine') {
      const n = fbm(x / 10, z / 10, seed + 3);
      if (n > 0.64) surface = biome === 'forest' ? Surface.Mud : Surface.Dirt;
    }
    b.setSurface(cell, surface);
  });
  const paint = (r: Rect, s: Surface) => b.paintSurface(r.min, r.max, s);
  const flatten = (r: Rect, h: number) => b.flatten(r.min, r.max, h);
  for (const z of roads) paint(R(3, z - 2, W - 3, z + 2), def.road);

  // ── Districts and compounds ─────────────────────────────────────────────────────────────
  interface District {
    x0: number;
    x1: number;
    z0: number;
    z1: number;
    top: boolean;
  }
  const splitRow = (z0: number, z1: number, top: boolean, cols: number): District[] => {
    const xs = [0];
    for (let i = 1; i < cols; i += 1) xs.push(Math.round((W * i) / cols + rng.range(-8, 8)));
    xs.push(W);
    return xs.slice(0, -1).map((x0, i) => ({ x0, x1: xs[i + 1]!, z0, z1, top }));
  };
  const topCols = rng.pick([1, 2, 2, 3, 3]);
  const bottomCols = topCols === 1 ? 3 : rng.pick([2, 3, 3]);
  const districts = [...splitRow(seaBand, m0, true, topCols), ...splitRow(m1, b1, false, bottomCols)];
  const kinds: CompoundKind[] = ['stockade', 'headquarters', def.special, ...rng.shuffle((['barracks', 'depot', 'radio', 'motor-pool'] as CompoundKind[]).filter((k) => k !== def.special))];
  // Five or six districts leave one open (woods or fields) half the time.
  const compoundCount = districts.length >= 5 && rng.chance(0.5) ? districts.length - 1 : districts.length;
  const order = rng.shuffle(districts.map((_, i) => i));
  const assigned = new Map<number, CompoundKind>();
  order.slice(0, compoundCount).forEach((d, i) => assigned.set(d, kinds[i]!));

  const guards: GuardSlot[] = [];
  const slots: SiteSlot[] = [];
  const reinforcements: SiteLayout['reinforcements'] = [];
  const keepClear: Rect[] = [];
  const sectors: string[] = [];
  const compoundNames: string[] = [];
  let holdingDone = false;
  const bottomSplits: number[] = [];

  districts.forEach((d, index) => {
    // Sector zones tile the map: top-row districts reach the far edge, bottom-row ones the band.
    const kind = assigned.get(index);
    const sector = kind ? COMPOUNDS[kind].name : def.open;
    if (!sectors.includes(sector)) sectors.push(sector);
    const zone = d.top ? R(d.x0, 0, d.x1, d.z1) : R(d.x0, d.z0, d.x1, d.z1);
    b.addZone({ id: sector, kind: 'sector', min: zone.min, max: zone.max });
    if (!d.top && d.x0 > 0) bottomSplits.push(d.x0);
    if (!kind) return;
    const c = COMPOUNDS[kind];
    compoundNames.push(c.name);

    // Compound footprint inside the district (local u along x, v from the back to the gate side).
    const margin = 4;
    const cw = Math.min(d.x1 - d.x0 - 2 * margin, d.x1 - d.x0 > 90 ? rng.int(55, 80) : rng.int(30, 46));
    const cd = Math.min(d.z1 - d.z0 - 6, rng.int(24, 31));
    const ox = d.x0 + margin + rng.range(0, d.x1 - d.x0 - 2 * margin - cw);
    const oz = d.top ? d.z1 - 3 - cd - rng.range(0, Math.max(0, d.z1 - d.z0 - 6 - cd)) : d.z0 + 3 + rng.range(0, Math.max(0, d.z1 - d.z0 - 6 - cd));
    const L = (u: number, v: number): Vec2 => P(ox + u, d.top ? oz + v : oz + cd - v);
    const LR = (u0: number, v0: number, u1: number, v1: number): Rect => {
      const a = L(u0, v0);
      const e = L(u1, v1);
      return { min: vec(Math.min(a.x, e.x), Math.min(a.z, e.z)), max: vec(Math.max(a.x, e.x), Math.max(a.z, e.z)) };
    };
    const front = face(d.top ? SOUTH : NORTH);
    const back = face(d.top ? NORTH : SOUTH);
    const outer = LR(0, 0, cw, cd);
    const floor = b.grid.heightAt(vec((outer.min.x + outer.max.x) / 2, (outer.min.z + outer.max.z) / 2));
    flatten({ min: vec(outer.min.x - 1, outer.min.z - 1), max: vec(outer.max.x + 1, outer.max.z + 1) }, floor);
    paint(LR(1, 1, cw - 1, cd - 1), c.yard);
    keepClear.push({ min: vec(outer.min.x - 4, outer.min.z - 4), max: vec(outer.max.x + 4, outer.max.z + 4) });

    // Buildings along the back, doors facing the yard.
    const roles = new Map<string, { rect: Rect; u: number; d: number; w: number; door: Vec2 }>();
    const extras = Math.max(0, Math.min(2, Math.floor((cw - 5) / 15) - c.buildings.length));
    const outbuildings: BuildingSpec[] = Array.from({ length: extras }, (_, i) => ({
      role: `outbuilding-${i}`,
      kind: rng.pick(['house', 'barracks', 'warehouse'] as const),
      w: [7, 11],
      d: [6, 8],
      height: rng.pick([3, 3.4, 4]),
    }));
    const specs = rng.shuffle([...c.buildings, ...outbuildings]);
    const n = specs.length;
    const slotW = (cw - 5) / n;
    const order2 = specs;
    let deepest = 0;
    order2.forEach((spec, i) => {
      const w = Math.min(rng.range(spec.w[0], spec.w[1]), slotW - 3);
      const bd = Math.min(rng.range(spec.d[0], spec.d[1]), cd - 15);
      const u0 = 2.5 + i * slotW + rng.range(0.5, slotW - w - 0.5);
      const u = u0 + w / 2;
      const rect = LR(u0, 2.5, u0 + w, 2.5 + bd);
      const door = L(u, 2.5 + bd);
      const windowed = spec.kind !== 'warehouse' && spec.kind !== 'bunker';
      kit.building(`${kind}-${spec.role}`, spec.kind, rect, {
        height: spec.height,
        material: spec.material ?? rng.pick(def.materials),
        roof: spec.roof ?? 'gable',
        floor: spec.kind === 'warehouse' ? Surface.Concrete : Surface.Wood,
        doors: [door],
        ...(windowed ? { windowEvery: 2 } : {}),
        ...(spec.locked ? { locked: [0] } : {}),
        floorHeight: floor,
      });
      roles.set(spec.role, { rect, u, d: bd, w, door });
      deepest = Math.max(deepest, bd);
      if (windowed) b.addLight({ id: `window-${kind}-${spec.role}`, kind: 'window', pos: L(u, 2.5 + bd / 2), height: 1.5, radius: 7, intensity: 0.45, color: '#ffd9a0' });
      // Clutter in the gap beside each building.
      kit.clutter(L(Math.min(cw - 2, u0 + w + 1.4), 4), 2, ['crate', 'barrel'], 0.8);
    });

    const yardV = 2.5 + deepest + 3;
    const gate = L(cw / 2, cd);
    const featureU = rng.chance(0.5) ? 5 : cw - 5;
    const featureV = cd - 4.5;
    const feature = L(featureU, featureV);
    // Half the compounds close one side of the yard with a building (a U-shaped yard).
    const sideW = rng.range(5, 7);
    const sideV0 = 2.5 + deepest + 3.6; // clear of the back row's doors and door posts
    const sideV1 = cd - 5.5;
    const sideLeft = featureU !== 5;
    const side = sideV1 - sideV0 >= 5 && rng.chance(0.5);
    let routeU0 = 4;
    let routeU1 = cw - 4;
    if (side) {
      const u0 = sideLeft ? 2.5 : cw - 2.5 - sideW;
      const vc = (sideV0 + sideV1) / 2;
      kit.building(`${kind}-side`, rng.pick(['barracks', 'house'] as const), LR(u0, sideV0, u0 + sideW, sideV1), {
        height: 3.2,
        material: rng.pick(def.materials),
        roof: 'gable',
        floor: Surface.Wood,
        doors: [L(sideLeft ? u0 + sideW : u0, vc)],
        windowEvery: 2,
        floorHeight: floor,
      });
      if (sideLeft) routeU0 = 2.5 + sideW + 2.5;
      else routeU1 = cw - 2.5 - sideW - 2.5;
    }
    // ── Outdoor feature ──
    switch (c.feature) {
      case 'fuel':
        kit.clutter(feature, 5, ['fuel-barrel'], 1.4);
        break;
      case 'gun':
        b.addProp({ id: `gun-${kind}`, kind: 'gun', pos: feature, rotation: front, scale: 1, height: 2, solid: true }, 1.2);
        break;
      case 'trucks':
        b.addProp({ id: `truck-${kind}-0`, kind: 'truck', pos: feature, rotation: face(EAST), scale: 1, height: 2.6, solid: true }, 1.1);
        break;
      case 'antenna':
        b.addProp({ id: `antenna-${kind}`, kind: 'antenna', pos: feature, rotation: 0, scale: 1, height: 9, solid: true }, 0.4);
        break;
      case 'logs':
        kit.clutter(feature, 5, ['crate'], 1.6);
        break;
      case 'water-tower':
        b.addSolidCircle(feature, 1.6, 9);
        b.addProp({ id: `water-tower-${kind}`, kind: 'water-tower', pos: feature, rotation: 0, scale: 1, height: 9, solid: true });
        break;
      case 'hay':
        for (let i = 0; i < 6; i += 1) {
          const p = L(featureU + rng.range(-2, 2), featureV + rng.range(-1.5, 1.5));
          b.addProp({ id: `hay-${kind}-${i}`, kind: 'tall-grass', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(1.6, 2.2), height: 0.9, solid: false });
          b.addConcealment(p, 1.6, 180);
        }
        break;
      default:
        break;
    }

    // ── Fence, gate, tower, lights, fixtures ──
    const fenced = rng.chance(c.fence);
    if (fenced) {
      const corners = [L(0, 0), L(cw, 0), L(cw, cd), L(0, cd)];
      kit.fence(`${kind}-back`, corners[0]!, corners[1]!, floor);
      kit.fence(`${kind}-side-a`, corners[1]!, corners[2]!, floor);
      kit.fence(`${kind}-front`, corners[2]!, corners[3]!, floor, [gate]);
      kit.fence(`${kind}-side-b`, corners[3]!, corners[0]!, floor);
    }
    kit.lamp(`${kind}-gate`, L(cw / 2 - 3.5, cd - 1.2));
    kit.lamp(`${kind}-yard`, L(side ? cw / 2 : featureU === 5 ? cw - 6 : 6, yardV + 0.8));
    b.addFixture({ type: 'alarm-bell', id: `bell:${kind}`, pos: L(cw / 2 + 3.5, cd - 1.2), label: `${c.name} alarm bell`, sector });
    if (c.radio) {
      const hq = roles.values().next().value!;
      b.addFixture({ type: 'radio', id: `radio:${kind}`, pos: L(hq.u + hq.w / 2 - 1, 2.5 + hq.d / 2), label: `${c.name} radio`, sector });
    }
    kit.container(`${kind}-yard`, L(featureU === 5 ? cw - 2 : 2, cd - 2.2), 2, 'crate');
    b.addSearchNode(L(routeU0, yardV));
    b.addSearchNode(L(routeU1, yardV));
    b.addSearchNode(L(cw / 2, cd + 2));

    // ── Guards ──
    const tag = kind.replace(/[^a-z]/g, '');
    const post = (id: string, pos: Vec2, facing: number, extra: { sweepArc?: number; sweepPeriod?: number; elevation?: number } = {}) =>
      b.addPost({ id: `post:${id}`, pos, facing, sweepArc: 1.2, sweepPeriod: 10 + rng.int(0, 4), ...extra });
    post(`${tag}-gate`, L(cw / 2 + 3.2, cd + 1.6), front, { sweepArc: 1.4 });
    guards.push({ id: `${tag}-gate`, sector, post: `post:${tag}-gate`, priority: 1, ...(rng.chance(0.4) ? { temperament: 'strict' as const } : {}) });
    b.addRoute({ id: `route:${tag}-yard`, points: [L(routeU0, yardV), L(routeU1, yardV)], waits: [4 + rng.int(0, 3), 4 + rng.int(0, 3)], loop: true });
    guards.push({ id: `${tag}-yard`, sector, route: `route:${tag}-yard`, priority: 1, ...(rng.chance(0.5) ? { lantern: true } : {}) });
    const key = c.slots[0]!.role === 'yard' ? null : roles.get(c.slots[0]!.role);
    if (key) {
      post(`${tag}-door`, L(key.u + 1.2, 2.5 + key.d + 1.6), front);
      guards.push({ id: `${tag}-door`, sector, post: `post:${tag}-door`, priority: c.holding ? 1 : 2, ...(c.holding ? { temperament: 'passive' as const } : {}) });
    } else {
      post(`${tag}-feature`, L(featureU, featureV - 3), front);
      guards.push({ id: `${tag}-feature`, sector, post: `post:${tag}-feature`, priority: 1, temperament: 'strict' });
    }
    if (c.officer) {
      const office = roles.get(c.officer)!;
      post(`${tag}-officer`, L(office.u, 2.5 + office.d / 2), front, { sweepArc: 1.0 });
      guards.push({ id: `${tag}-officer`, sector, post: `post:${tag}-officer`, priority: 1, rank: 'officer', temperament: 'strict', ...(c.radio ? { radio: true } : {}) });
    }
    if (rng.chance(c.tower)) {
      const towerPos = L(rng.chance(0.5) ? -2.5 : cw + 2.5, -2.5);
      kit.tower(`tower-${kind}`, towerPos, floor);
      post(`${tag}-tower`, towerPos, back, { sweepArc: 1.6, sweepPeriod: 16, elevation: 5 });
      guards.push({ id: `${tag}-tower`, sector, post: `post:${tag}-tower`, priority: 3 });
      if (rng.chance(0.5)) {
        b.addLight({ id: `searchlight-${kind}`, kind: 'searchlight', pos: towerPos, height: 6.5, radius: 45, intensity: 1, color: '#f4f1e0' });
        b.addFixture({ type: 'searchlight', id: `searchlight:${kind}`, pos: towerPos, label: `${c.name} searchlight`, sector, heading: back, sweepArc: 1.2, sweepPeriod: 15, range: 45 });
      }
    }
    guards.push({ id: `${tag}-yard-2`, sector, route: `route:${tag}-yard`, routeStart: 1, priority: 3 });

    // ── Road connection and reinforcements ──
    const road = d.top ? roadNorth : roadSouth;
    const gateCanon = { x: ox + cw / 2, z: d.top ? oz + cd : oz };
    paint(R(gateCanon.x - 2, Math.min(gateCanon.z, road), gateCanon.x + 2, Math.max(gateCanon.z, road)), def.road);
    keepClear.push(R(gateCanon.x - 4, Math.min(gateCanon.z, road) - 2, gateCanon.x + 4, Math.max(gateCanon.z, road) + 2));
    reinforcements.push({ sector, pos: P(gateCanon.x + 5, road), count: 3 });

    // ── Objective slots ──
    for (const s of c.slots) {
      const id = `${tag}-${s.role}`;
      let pos: Vec2;
      let indoor = true;
      if (s.role === 'yard') {
        pos = L(featureU, featureV - 1.8);
        indoor = false;
      } else {
        const bld = roles.get(s.role)!;
        pos = L(bld.u + rng.range(-bld.w / 5, bld.w / 5), 2.5 + 1.6);
      }
      b.addSlot({ id: `slot:${id}`, pos, tags: [s.tag], indoor, facing: front });
      slots.push({ id, tag: s.tag, label: s.what, sector });
    }
    if (c.holding && !holdingDone) {
      const cells = roles.get(c.holding)!;
      b.addZone({ id: 'holding', kind: 'holding', min: vec(cells.rect.min.x + 0.7, cells.rect.min.z + 0.7), max: vec(cells.rect.max.x - 0.7, cells.rect.max.z - 0.7), label: c.name });
      holdingDone = true;
    }
  });

  // ── The central band: river, railway or road ────────────────────────────────────────────
  const bandZone = R(0, m0, W, m1);
  const bandName = 'road';
  sectors.push(bandName);
  b.addZone({ id: bandName, kind: 'sector', min: bandZone.min, max: bandZone.max });
  const crossings: [number, number] = [rng.range(18, W / 2 - 10), rng.range(W / 2 + 10, W - 18)];
  if (biome === 'alpine') {
    const [bridgeX, logX] = rng.chance(0.5) ? crossings : [crossings[1], crossings[0]];
    const bank = GROUND + 0.1;
    const span = (x: number, half: number, h: number, id: string, kind: 'bridge' | 'log') => {
      const r0 = riverAt(x);
      flatten(R(x - half - 1, r0 - 10, x + half + 1, r0 - 6.5), h);
      flatten(R(x - half - 1, r0 + 6.5, x + half + 1, r0 + 10), h);
      const deck = R(x - half, r0 - 7, x + half, r0 + 7);
      b.setDeck(deck.min, deck.max, h, Surface.Wood);
      b.addStructure({ id, kind: 'pier', pos: P(x, r0), size: S(half * 2, 14), rotation: 0, baseHeight: SEA, height: h, material: 'wood' });
      paint(R(x - half, roadN, x + half, roadS), kind === 'bridge' ? def.road : Surface.Snow);
      keepClear.push(R(x - half - 3, roadN - 3, x + half + 3, roadS + 3));
    };
    span(bridgeX, 2, bank, 'bridge-main', 'bridge');
    span(logX, 0.75, bank + 0.2, 'log-crossing', 'log');
    const ladderX = rng.range(10, W - 10);
    const lr = riverAt(ladderX);
    b.addLink(P(ladderX, lr - 6.2), P(ladderX, lr - 2.8), 'ladder', 3);
    b.addLink(P(ladderX, lr + 6.2), P(ladderX, lr + 2.8), 'ladder', 3);
    for (let x = 4; x < W; x += 8) b.setNoiseFloor(P(x, riverAt(x)), 6, 36);
    keepClear.push(R(0, riverZ - 8, W, riverZ + 8));
  } else if (biome === 'rail') {
    const tracks = [m0 + 8, m0 + 12, m0 + 16];
    for (const [i, z] of tracks.entries()) {
      paint(R(2, z - 1.4, W - 2, z + 1.4), Surface.Gravel);
      const a = P(2, z);
      const e = P(W - 2, z);
      b.addStructure({ id: `rail-${i}`, kind: 'rail', pos: P(W / 2, z), size: S(W - 4, 1.5), rotation: 0, baseHeight: GROUND, height: 0.2, material: 'metal', path: [a, e] });
      // Wagons in rakes, leaving the level crossings and a few random gaps open.
      let x = rng.range(6, 16);
      let wagon = 0;
      while (x < W - 14) {
        const length = 10;
        const clear = crossings.every((cx) => Math.abs(cx - (x + length / 2)) > length / 2 + 4);
        if (clear && rng.chance(0.6)) {
          const centre = P(x + length / 2, z);
          const r = R(x, z - 1.4, x + length, z + 1.4);
          b.addSolid(r.min, r.max, 3.4);
          b.addProp({ id: `wagon-${i}-${wagon++}`, kind: 'wagon', pos: centre, rotation: face(EAST), scale: 1, height: 3.4, solid: true });
          b.addSearchNode(P(x - 1.2, z + 2.2));
        }
        x += length + (rng.chance(0.3) ? rng.range(4, 9) : 1);
      }
    }
    paint(R(2, m0 + 6, W - 2, m0 + 18), Surface.Gravel);
    for (const cx of crossings) paint(R(cx - 2, roadN, cx + 2, roadS), def.road);
    keepClear.push(R(0, m0, W, m1));
  } else {
    keepClear.push(R(0, roadZ - 4, W, roadZ + 4));
  }
  if (biome === 'coastal') {
    const pierX = rng.range(20, W - 20);
    const s = shoreAt(pierX);
    const deck = R(pierX - 1.5, s - 12, pierX + 1.5, s + 3);
    b.setDeck(deck.min, deck.max, 1.2, Surface.Wood);
    b.addStructure({ id: 'jetty', kind: 'pier', pos: P(pierX, s - 4.5), size: S(3, 15), rotation: 0, baseHeight: SEA, height: 1.2, material: 'wood' });
    b.addProp({ id: 'boat-0', kind: 'rowboat', pos: P(pierX + 3.5, s - 7), rotation: face(SOUTH), scale: 1, height: 1, solid: false });
    b.addProp({ id: 'boat-1', kind: 'fishing-boat', pos: P(pierX - 5, s - 9), rotation: face(SOUTH), scale: 1, height: 2.4, solid: false });
    for (let x = 4; x < W; x += 10) b.setNoiseFloor(P(x, shoreAt(x)), 8, 38); // surf
    keepClear.push(R(0, 0, W, seaBand - 2));
  }

  // ── Approach, insertion and extraction ──────────────────────────────────────────────────
  sectors.push('outskirts');
  const approachZone = R(0, b1, W, D);
  b.addZone({ id: 'outskirts', kind: 'sector', min: approachZone.min, max: approachZone.max });
  const insertX = rng.range(10, W - 24);
  const farX = insertX < W / 2 ? rng.range(Math.min(W - 24, insertX + 50), W - 24) : rng.range(10, Math.max(10, insertX - 50));
  const extractX = rng.chance(0.6) ? farX : insertX;
  const insertZone = R(insertX, D - 14, insertX + 14, D - 4);
  const extractZone = R(extractX, D - 14, extractX + 14, D - 4);
  b.addZone({ id: 'insertion', kind: 'insertion', min: insertZone.min, max: insertZone.max, label: 'Drop zone' });
  b.addZone({ id: 'extraction', kind: 'extraction', min: extractZone.min, max: extractZone.max, label: extractX === insertX ? 'Drop zone' : 'Pick-up point' });
  keepClear.push(R(insertX - 3, D - 17, insertX + 17, D - 1), R(extractX - 3, D - 17, extractX + 17, D - 1));
  [
    [3, 4],
    [5, 4.6],
    [7, 4],
    [3.4, 6.6],
    [5.4, 7.2],
    [7.4, 6.6],
  ].forEach(([dx, dz], i) => b.addSlot({ id: `slot:insertion-${i}`, pos: P(insertX + dx! + 2, D - 14 + dz!), tags: ['insertion'], indoor: false, facing: face(NORTH) }));
  // A track from the drop zone to the road, between two bottom-row compounds.
  const trackX = bottomSplits.length > 0 ? rng.pick(bottomSplits) : W / 2;
  const trackZ = D - 17;
  paint(R(Math.min(insertX + 7, trackX) - 1.5, trackZ - 1.5, Math.max(insertX + 7, trackX) + 1.5, trackZ + 1.5), Surface.Dirt);
  paint(R(trackX - 1.5, roadSouth, trackX + 1.5, trackZ), Surface.Dirt);
  keepClear.push(R(trackX - 3, roadSouth, trackX + 3, trackZ + 3), R(Math.min(insertX + 7, trackX) - 3, trackZ - 3, Math.max(insertX + 7, trackX) + 3, trackZ + 3));

  // A road patrol on each side of the band.
  const roadPatrol = (id: string, z: number, priority: 1 | 2 | 3) => {
    const xa = rng.range(10, W / 2 - 10);
    const xb = rng.range(W / 2 + 10, W - 10);
    b.addRoute({ id: `route:${id}`, points: [P(xa, z), P(xb, z)], waits: [3 + rng.int(0, 4), 3 + rng.int(0, 4)], loop: true });
    guards.push({ id, sector: bandName, route: `route:${id}`, priority, ...(rng.chance(0.5) ? { lantern: true } : {}) });
  };
  roadPatrol('road-south', roadSouth, 1);
  roadPatrol('road-north', roadNorth, singleRoad ? 3 : 2);

  // ── Vegetation ──────────────────────────────────────────────────────────────────────────
  const world = { min: vec(2, 2), max: vec(WW - 2, DD - 2) };
  for (const t of def.trees) kit.trees(world, t.count, t.kind, keepClear, t.kind === 'tree-oak' ? 4.5 : 3.2);
  const bushes = biome === 'farmland' ? 70 : 45;
  for (let i = 0; i < bushes; i += 1) {
    const p = vec(rng.range(4, WW - 4), rng.range(4, DD - 4));
    if (keepClear.some((r) => inRect(p, r)) || b.level.surface[b.grid.cellAt(p)] === Surface.DeepWater) continue;
    b.addProp({ id: `bush-${i}`, kind: 'bush', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.9, 1.4), height: 1.3, solid: false });
    b.addConcealment(p, 1.5, 200);
  }
  const grass = biome === 'farmland' ? 90 : biome === 'alpine' ? 0 : 30;
  for (let i = 0; i < grass; i += 1) {
    const p = vec(rng.range(4, WW - 4), rng.range(4, DD - 4));
    if (keepClear.some((r) => inRect(p, r)) || b.level.surface[b.grid.cellAt(p)] === Surface.DeepWater) continue;
    b.addProp({ id: `grass-${i}`, kind: 'tall-grass', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(1.5, 2.4), height: 0.9, solid: false });
    b.addConcealment(p, rng.range(2, 3.5), 150);
  }
  if (biome !== 'farmland') {
    for (let i = 0; i < 14; i += 1) {
      const p = vec(rng.range(6, WW - 6), rng.range(6, DD - 6));
      if (keepClear.some((r) => inRect(p, r)) || b.level.surface[b.grid.cellAt(p)] === Surface.DeepWater) continue;
      b.addProp({ id: `rock-${i}`, kind: 'rock', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.7, 1.4), height: 1.1, solid: true }, 0.7);
    }
  }
  kit.container('drop-bush', P(insertX + 12, D - 15.5), 1, 'bush');

  for (const door of kit.doorFronts) b.addSearchNode(door);
  const level = b.finalize(options.bake === false ? {} : { bakeLight: bakeStaticLight });
  // Steep ground is only known after finalize: slide any spawn along its road to firm footing.
  const walkable = (p: Vec2) => p.x > 1 && p.x < WW - 1 && p.z > 1 && p.z < DD - 1 && (level.flags[b.grid.cellAt(p)]! & CellFlag.Walkable) !== 0;
  for (const r of reinforcements) {
    if (walkable(r.pos)) continue;
    for (let step = 1; step <= 30; step += 1) {
      const candidate = [vec(r.pos.x + step, r.pos.z), vec(r.pos.x - step, r.pos.z)].find(walkable);
      if (candidate) {
        r.pos = candidate;
        break;
      }
    }
  }

  const timeOfDay = rng.pick([23, 23, 21, 19, 6, 13]);
  const weather = rng.pick(def.weather);
  const description = `${name}: ${def.sentence}. It holds the ${listOf(compoundNames)}.`;
  return {
    level,
    layout: {
      name,
      description: description.slice(0, 400),
      sectors,
      guards,
      reinforcements,
      slots,
      defaults: { timeOfDay, weather, parSeconds: 840 + 60 * compoundNames.length },
    },
  };
}

const listOf = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
void WEST;
