import { vec, type Vec2 } from '../core/math';
import { Rng } from '../core/rng';
import { LevelBuilder } from '../level/builder';
import { type LevelData, Surface } from '../level/types';
import { inRect, LevelKit, NORTH, SOUTH, WEST, EAST, type Rect } from './kit';
import { bakeStaticLight } from './lighting';
import { fbm, smoothstep } from './noise';

export const ALPINE_TEMPLATE_ID = 'alpine-ridge';
export const ALPINE_GENERATOR_VERSION = 'alpine@1';

const W = 150;
const D = 110;
const SEA = -2.2;
const VALLEY = 2;
const PLATEAU = 11;
const GORGE_X = 70;

/**
 * "Whitecrown Ridge" alpine template: a snowy valley split by an icy gorge (bridge and a log
 * crossing; the Marine can swim it), a mountain hamlet with a fuel depot and a lock-up, and a
 * fenced radar station on a cliff plateau reached by a switchback road or the Infiltrator's climb.
 */
export function generateAlpine(options: { seed: number; id?: string }): LevelData {
  const seed = options.seed >>> 0;
  const rng = Rng.fromSeed(seed ^ 0xa1b1e);
  const b = new LevelBuilder({ id: options.id ?? `alpine-${seed}`, templateId: ALPINE_TEMPLATE_ID, seed, generatorVersion: ALPINE_GENERATOR_VERSION, width: W, depth: D, seaLevel: SEA });
  const kit = new LevelKit(b, rng);

  const gorgeX = (z: number) => GORGE_X + 2.2 * Math.sin(z / 13 + seed * 0.001);
  const rampHeight = (z: number) => VALLEY + (PLATEAU - VALLEY) * Math.min(1, Math.max(0, (52.5 - z) / 20.5));

  b.setHeight((x, z) => {
    let h = VALLEY + 0.9 * (fbm(x / 30, z / 30, seed) - 0.5);
    // Enclosing slopes to the west and south.
    h += 7 * smoothstep(10, 0, x) + 6 * smoothstep(100, 110, z);
    // Gorge with an icy river.
    const g = Math.abs(x - gorgeX(z));
    if (g < 6) h = Math.min(h, SEA - 1.6 + (h - SEA + 1.6) * smoothstep(2.6, 6, g));
    // Radar plateau in the north-east, cliffs to the south and west.
    const plateau = smoothstep(81, 85, x) * (1 - smoothstep(32, 36, z));
    h = h + (PLATEAU - h) * plateau;
    // Switchback road up to the plateau.
    if (x >= 139 && x <= 146 && z >= 28 && z <= 54) h = Math.max(h, rampHeight(z));
    return h;
  });

  // ── Surfaces ──────────────────────────────────────────────────────────────────────────────
  b.forRect(vec(0, 0), vec(W, D), (cell) => {
    const h = b.level.cellHeight[cell]!;
    b.setSurface(cell, h < SEA + 0.1 ? Surface.DeepWater : h < SEA + 0.6 ? Surface.Rock : Surface.Snow);
  });
  b.paintSurface(vec(74, 59), vec(139, 64), Surface.Gravel); // valley road east of the bridge
  b.paintSurface(vec(139, 28), vec(146, 64), Surface.Gravel); // ramp road
  b.paintSurface(vec(92, 6), vec(138, 28), Surface.Gravel); // station yard
  b.paintSurface(vec(20, 60), vec(66, 64), Surface.Dirt); // forest track to the bridge

  // ── Crossings ─────────────────────────────────────────────────────────────────────────────
  const bridgeZ = 60;
  for (const [z0, z1, h] of [
    [bridgeZ - 1, bridgeZ + 5, VALLEY + 0.1],
    [93, 96.5, VALLEY + 0.3],
  ] as const) {
    const gx = gorgeX((z0 + z1) / 2);
    b.flatten(vec(gx - 11, z0), vec(gx - 6.5, z1), h);
    b.flatten(vec(gx + 6.5, z0), vec(gx + 11, z1), h);
  }
  b.setDeck(vec(gorgeX(62) - 6.5, bridgeZ), vec(gorgeX(62) + 6.5, bridgeZ + 4), VALLEY + 0.1, Surface.Wood);
  b.addStructure({ id: 'bridge-main', kind: 'pier', pos: vec(gorgeX(62), bridgeZ + 2), size: vec(13, 4), rotation: 0, baseHeight: SEA, height: VALLEY + 0.1, material: 'wood' });
  const logZ = 94;
  b.setDeck(vec(gorgeX(95) - 6.5, logZ), vec(gorgeX(95) + 6.5, logZ + 1.5), VALLEY + 0.3, Surface.Wood);
  b.addStructure({ id: 'log-crossing', kind: 'pier', pos: vec(gorgeX(95), logZ + 0.75), size: vec(13, 1.5), rotation: 0, baseHeight: SEA, height: VALLEY + 0.3, material: 'wood' });
  // Ladders down to the river for the Marine.
  b.addLink(vec(gorgeX(40) - 6.2, 40), vec(gorgeX(40) - 2.8, 40), 'ladder', 3);
  b.addLink(vec(gorgeX(40) + 6.2, 40), vec(gorgeX(40) + 2.8, 40), 'ladder', 3);

  // ── Hamlet ────────────────────────────────────────────────────────────────────────────────
  kit.building('barracks', 'barracks', { min: vec(98, 66), max: vec(112, 73) }, { height: 3.4, material: 'timber', roof: 'gable', floor: Surface.Wood, doors: [vec(105, 66)], windowEvery: 2 });
  kit.building('chalet', 'house', { min: vec(118, 68), max: vec(126, 76) }, { height: 3.6, material: 'plaster', roof: 'gable', floor: Surface.Wood, doors: [vec(122, 68)], windowEvery: 2 });
  kit.building('lockup', 'barracks', { min: vec(88, 72), max: vec(94, 78) }, { height: 3, material: 'stone', roof: 'flat', floor: Surface.Stone, doors: [vec(91, 72)], locked: [0] });
  kit.building('workshop', 'warehouse', { min: vec(128, 70), max: vec(137, 78) }, { height: 3.8, material: 'wood', roof: 'gable', floor: Surface.Wood, doors: [vec(132.5, 70)], doorWidth: [2] });
  kit.building('hunting-lodge', 'house', { min: vec(26, 44), max: vec(33, 50) }, { height: 3.2, material: 'timber', roof: 'gable', floor: Surface.Wood, doors: [vec(29.5, 50)] });

  // ── Radar station ─────────────────────────────────────────────────────────────────────────
  const station: Rect = { min: vec(92, 6), max: vec(138, 28) };
  kit.building('radar-hut', 'bunker', { min: vec(104, 11), max: vec(114, 19) }, { height: 3.2, material: 'concrete', roof: 'flat', floor: Surface.Concrete, doors: [vec(114, 15)], floorHeight: PLATEAU });
  kit.building('signal-hut', 'radio-hut', { min: vec(124, 10), max: vec(130, 16) }, { height: 2.8, material: 'wood', roof: 'flat', floor: Surface.Wood, doors: [vec(127, 16)], floorHeight: PLATEAU });
  kit.building('station-quarters', 'barracks', { min: vec(96, 21), max: vec(106, 26) }, { height: 3.2, material: 'timber', roof: 'gable', floor: Surface.Wood, doors: [vec(101, 21)], windowEvery: 2, floorHeight: PLATEAU });
  const gate = vec(138, 22);
  kit.fence('west', station.min, vec(station.min.x, station.max.z), PLATEAU);
  kit.fence('north', station.min, vec(station.max.x, station.min.z), PLATEAU);
  kit.fence('east', vec(station.max.x, station.min.z), station.max, PLATEAU, [gate]);
  kit.fence('south', vec(station.min.x, station.max.z), station.max, PLATEAU, [vec(118, 28)]);
  kit.tower('tower-station', vec(95, 9), PLATEAU);
  b.addProp({ id: 'radar-mast', kind: 'antenna', pos: vec(116.5, 13), rotation: 0, scale: 1.2, height: 10, solid: false });
  b.addProp({ id: 'radar-gun', kind: 'gun', pos: vec(126, 22), rotation: NORTH, scale: 1, height: 1.6, solid: true }, 0.8);
  kit.sandbags('sandbags-gate', vec(140, 18.5), 2, true, PLATEAU);

  // Infiltrator climbs: south cliff of the plateau, and the gorge wall near the log crossing.
  b.addLink(vec(110, 38.5), vec(110, 30), 'climb', 9, 'climb');
  b.addLink(vec(88, 40), vec(88, 31), 'climb', 9, 'climb');

  // ── Lights and fixtures ───────────────────────────────────────────────────────────────────
  [vec(62, 58), vec(79, 66), vec(110, 58), vec(128, 64.5)].forEach((p, i) => kit.lamp(`valley-${i}`, p));
  [vec(120, 20), vec(134, 25), vec(143, 33)].forEach((p, i) => kit.lamp(`station-${i}`, p));
  b.addLight({ id: 'window-chalet', kind: 'window', pos: vec(122, 72), height: 1.5, radius: 7, intensity: 0.45, color: '#ffd9a0' });
  b.addLight({ id: 'window-barracks', kind: 'window', pos: vec(105, 69.5), height: 1.5, radius: 9, intensity: 0.45, color: '#ffd9a0' });
  b.addLight({ id: 'searchlight-station', kind: 'searchlight', pos: vec(95, 9), height: 6.5, radius: 50, intensity: 1, color: '#f4f1e0' });
  b.addFixture({ type: 'searchlight', id: 'searchlight:station', pos: vec(95, 9), label: 'Station searchlight', sector: 'station', heading: 1.1, sweepArc: 1.3, sweepPeriod: 16, range: 48 });
  b.addFixture({ type: 'alarm-bell', id: 'bell:station', pos: vec(120, 24), label: 'Station alarm bell', sector: 'station' });
  b.addFixture({ type: 'alarm-bell', id: 'bell:hamlet', pos: vec(114, 65), label: 'Hamlet alarm bell', sector: 'hamlet' });
  b.addFixture({ type: 'radio', id: 'radio:station-net', pos: vec(129, 13), label: 'Station radio set', sector: 'station' });
  kit.container('woodpile', vec(96, 64), 1, 'crate');
  kit.container('depot-crates', vec(118, 58.5), 2, 'crate');
  kit.container('station-crates', vec(132, 9), 1, 'crate');
  kit.container('lodge-bush', vec(36, 52), 1, 'bush');

  // Fuel depot (outdoor sabotage target) with drums.
  for (let i = 0; i < 7; i += 1) kit.prop('fuel-barrel', vec(123 + (i % 4) * 1.2, 52.6 + Math.floor(i / 4) * 1.3));
  kit.clutter(vec(108, 76), 3, ['barrel', 'crate']);
  kit.clutter(vec(131, 80), 2, ['crate', 'barrel']);
  kit.clutter(vec(100, 9), 2, ['crate']);
  b.addProp({ id: 'truck-depot', kind: 'truck', pos: vec(132, 57), rotation: EAST, scale: 1, height: 2.6, solid: true }, 1.1);

  // ── Forest ────────────────────────────────────────────────────────────────────────────────
  const keepClear: Rect[] = [
    ...kit.buildingRects.map((r) => ({ min: vec(r.min.x - 2, r.min.z - 2), max: vec(r.max.x + 2, r.max.z + 2) })),
    { min: vec(5, 78), max: vec(23, 94) },
    { min: vec(18, 58), max: vec(150, 66) },
    { min: vec(60, 0), max: vec(80, D) },
    station,
    { min: vec(136, 26), max: vec(150, 66) },
  ];
  kit.trees({ min: vec(4, 4), max: vec(60, 106) }, 150, 'tree-pine', keepClear);
  kit.trees({ min: vec(82, 82), max: vec(146, 106) }, 45, 'tree-pine', keepClear);
  kit.trees({ min: vec(82, 38), max: vec(136, 56) }, 18, 'tree-pine', [...keepClear, { min: vec(115, 50), max: vec(136, 60) }]);
  for (let i = 0; i < 22; i += 1) {
    const p = vec(rng.range(12, 60), rng.range(30, 100));
    if (keepClear.some((r) => inRect(p, r))) continue;
    b.addProp({ id: `bush-${i}`, kind: 'bush', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.9, 1.4), height: 1.3, solid: false });
    b.addConcealment(p, 1.5, 200);
  }
  for (let i = 0; i < 16; i += 1) {
    const p = vec(rng.range(84, 148), rng.range(36, 48));
    if (keepClear.some((r) => inRect(p, r))) continue;
    b.addProp({ id: `boulder-${i}`, kind: 'rock', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.7, 1.4), height: 1.1, solid: true }, 0.7);
  }
  for (let z = 4; z < D; z += 8) b.setNoiseFloor(vec(gorgeX(z), z), 6, 36); // river rush

  // ── Guards ────────────────────────────────────────────────────────────────────────────────
  const post = (id: string, pos: Vec2, facing: number, extra: { sweepArc?: number; sweepPeriod?: number; elevation?: number } = {}) => b.addPost({ id: `post:${id}`, pos, facing, ...extra });
  post('bridge-west', vec(gorgeX(62) - 8.5, 63.5), WEST, { sweepArc: 1.0, sweepPeriod: 12 });
  post('bridge-east', vec(gorgeX(62) + 8.5, 60.5), EAST, { sweepArc: 1.2, sweepPeriod: 10 });
  post('chalet-inside', vec(120, 74), SOUTH, { sweepArc: 1.0, sweepPeriod: 12 });
  post('chalet-door', vec(122, 66.6), NORTH, { sweepArc: 1.4, sweepPeriod: 9 });
  post('lockup-door', vec(91, 70.5), NORTH, { sweepArc: 1.4, sweepPeriod: 10 });
  post('depot', vec(121, 56.5), EAST, { sweepArc: 1.6, sweepPeriod: 11 });
  post('ramp-foot', vec(142.5, 52), WEST, { sweepArc: 1.2, sweepPeriod: 12 });
  post('gate', vec(140, 21.5), EAST, { sweepArc: 0.8, sweepPeriod: 9 });
  post('radar-door', vec(115.6, 15), EAST, { sweepArc: 1.0, sweepPeriod: 10 });
  post('radar-inside', vec(106, 13), EAST);
  post('tower-station', vec(95, 9), 1.1, { sweepArc: 1.4, sweepPeriod: 16, elevation: 5 });
  post('workshop', vec(132.5, 68.5), NORTH, { sweepArc: 1.4, sweepPeriod: 12 });
  const route = (id: string, points: Vec2[], waits: number[]) => b.addRoute({ id: `route:${id}`, points, waits, loop: true });
  route('valley-road', [vec(80, 61.5), vec(110, 61.5), vec(136, 61.5), vec(110, 62.5)], [3, 0, 4, 0]);
  route('hamlet', [vec(96, 79), vec(115, 79), vec(126, 79.5), vec(115, 80)], [3, 0, 4, 0]);
  route('west-woods', [vec(26, 56), vec(52, 54), vec(56, 40), vec(40, 36)], [4, 0, 4, 0]);
  route('station-yard', [vec(98, 16), vec(120, 8.5), vec(134, 16), vec(120, 25)], [2, 2, 3, 2]);
  route('ramp', [vec(142.5, 48), vec(142.5, 31)], [5, 5]);
  route('cliff-path', [vec(90, 42), vec(132, 42)], [4, 4]);

  // ── Zones and slots ───────────────────────────────────────────────────────────────────────
  b.addZone({ id: 'insertion', kind: 'insertion', min: vec(7, 81), max: vec(21, 91), label: 'Drop zone' });
  b.addZone({ id: 'extraction', kind: 'extraction', min: vec(7, 81), max: vec(21, 91), label: 'Drop zone' });
  b.addZone({ id: 'holding', kind: 'holding', min: vec(88.7, 72.7), max: vec(93.3, 77.3), label: 'Lock-up' });
  b.addZone({ id: 'radar', kind: 'restricted', min: vec(104.4, 11.4), max: vec(113.6, 18.6), label: 'Radar hut' });
  b.addZone({ id: 'station', kind: 'sector', min: vec(80, 0), max: vec(W, 37) });
  b.addZone({ id: 'hamlet', kind: 'sector', min: vec(80, 37), max: vec(W, D) });
  b.addZone({ id: 'gorge', kind: 'sector', min: vec(60, 0), max: vec(80, D) });
  b.addZone({ id: 'woods', kind: 'sector', min: vec(0, 0), max: vec(60, D) });

  const slot = (id: string, pos: Vec2, tags: string[], indoor: boolean, facing = 0) => b.addSlot({ id: `slot:${id}`, pos, tags, indoor, facing });
  [vec(10, 84), vec(12, 84.6), vec(14, 84), vec(10.4, 86.6), vec(12.4, 87.2), vec(14.4, 86.6)].forEach((p, i) => slot(`insertion-${i}`, p, ['insertion'], false, 0));
  slot('radar-console', vec(109, 15), ['objective-target'], true);
  slot('signal-hut', vec(127, 12.5), ['objective-target'], true);
  slot('fuel-depot', vec(125.5, 55.5), ['objective-target'], false);
  slot('chalet-desk', vec(124.5, 74), ['item'], true);
  slot('quarters-locker', vec(98.5, 24.5), ['item'], true);
  slot('lockup-cell', vec(91, 76), ['prisoner'], true);
  slot('lodge', vec(29.5, 46), ['prisoner'], true);

  for (const door of kit.doorFronts) b.addSearchNode(door);
  return b.finalize({ bakeLight: bakeStaticLight });
}
