import { vec, type Vec2 } from '../core/math';
import { Rng } from '../core/rng';
import { LevelBuilder } from '../level/builder';
import { type LevelData, Surface } from '../level/types';
import { inRect, LevelKit, NORTH, SOUTH, WEST, EAST, type Rect } from './kit';
import { bakeStaticLight } from './lighting';
import { fbm } from './noise';

export const RAIL_TEMPLATE_ID = 'rail-junction';
export const RAIL_GENERATOR_VERSION = 'rail@1';

const W = 160;
const D = 110;
const GROUND = 1.5;
const TRACKS = [42, 48, 54, 60];

/**
 * "Corvan Junction" rail template: a marshalling yard with four tracks lined by wagons (cover and
 * sight-line corridors), an ammunition train, a signal box, the station and platform, an engine
 * shed, a depot office and a fenced perimeter with a level crossing. No water.
 */
export function generateRail(options: { seed: number; id?: string }): LevelData {
  const seed = options.seed >>> 0;
  const rng = Rng.fromSeed(seed ^ 0x7a11);
  const b = new LevelBuilder({ id: options.id ?? `rail-${seed}`, templateId: RAIL_TEMPLATE_ID, seed, generatorVersion: RAIL_GENERATOR_VERSION, width: W, depth: D, seaLevel: -30 });
  const kit = new LevelKit(b, rng);

  b.setHeight((x, z) => {
    const yard = z > 36 && z < 66;
    const rolling = 0.8 * (fbm(x / 28, z / 28, seed) - 0.5) + (z > 90 ? 1.6 * Math.max(0, fbm(x / 18, z / 18, seed + 7) - 0.4) : 0);
    return GROUND + (yard ? 0 : rolling) + (x < 6 || x > W - 6 ? 1.5 : 0);
  });
  b.forRect(vec(0, 0), vec(W, D), (cell) => {
    const c = b.grid.center(cell);
    b.setSurface(cell, fbm(c.x / 10, c.z / 10, seed + 3) > 0.62 ? Surface.Dirt : Surface.Grass);
  });
  b.flatten(vec(6, 36), vec(W - 6, 66), GROUND);

  // ── Tracks (ballast, rails, wagons) ───────────────────────────────────────────────────────
  for (const [i, z] of TRACKS.entries()) {
    b.paintSurface(vec(6, z - 1.4), vec(W - 6, z + 1.4), Surface.Gravel);
    b.addStructure({ id: `rail-${i}`, kind: 'rail', pos: vec(W / 2, z), size: vec(W - 12, 1.5), rotation: 0, baseHeight: GROUND, height: 0.2, material: 'metal', path: [vec(6, z), vec(W - 6, z)] });
  }
  b.paintSurface(vec(6, 39.4), vec(W - 6, 62.6), Surface.Gravel);
  const wagon = (id: string, x: number, z: number, length = 10) => {
    b.addSolid(vec(x - length / 2, z - 1.4), vec(x + length / 2, z + 1.4), 3.4);
    b.addProp({ id: `wagon-${id}`, kind: 'wagon', pos: vec(x, z), rotation: 0, scale: length / 10, height: 3.4, solid: true });
    b.addSearchNode(vec(x - length / 2 - 1.2, z + 2.2));
  };
  // Ammunition train on track 3, broken into two rakes so the yard can be crossed.
  [100, 111, 131, 142].forEach((x, i) => wagon(`ammo-${i}`, x, TRACKS[2]!));
  // Empty stock on the other tracks, leaving gaps.
  [20, 31, 58, 69].forEach((x, i) => wagon(`west-${i}`, x, TRACKS[0]!));
  [40, 51, 90].forEach((x, i) => wagon(`mid-${i}`, x, TRACKS[1]!));
  [28, 74, 85, 120].forEach((x, i) => wagon(`south-${i}`, x, TRACKS[3]!));

  // ── Station side (north) ──────────────────────────────────────────────────────────────────
  b.paintSurface(vec(54, 36.5), vec(92, 39.4), Surface.Concrete); // platform
  kit.building('station', 'office', { min: vec(60, 26), max: vec(84, 34) }, { height: 4, material: 'brick', roof: 'gable', floor: Surface.Wood, doors: [vec(72, 34), vec(66, 26)], windowEvery: 2, floorHeight: GROUND });
  kit.building('signal-box', 'radio-hut', { min: vec(100, 28), max: vec(106, 34) }, { height: 4.6, material: 'brick', roof: 'gable', floor: Surface.Wood, doors: [vec(103, 34)], windowEvery: 2, floorHeight: GROUND });
  kit.building('guardhouse', 'barracks', { min: vec(118, 24), max: vec(132, 31) }, { height: 3.4, material: 'timber', roof: 'gable', floor: Surface.Wood, doors: [vec(125, 31)], windowEvery: 2, floorHeight: GROUND });
  b.paintSurface(vec(70, 10), vec(74, 26), Surface.Gravel); // station approach road
  // ── Yard side (south) ─────────────────────────────────────────────────────────────────────
  kit.building('engine-shed', 'warehouse', { min: vec(118, 68), max: vec(142, 82) }, { height: 5.2, material: 'brick', roof: 'gable', floor: Surface.Concrete, doors: [vec(130, 68), vec(118, 75)], doorWidth: [3, 1.4], floorHeight: GROUND });
  kit.building('depot-office', 'office', { min: vec(24, 68), max: vec(34, 76) }, { height: 3.6, material: 'plaster', roof: 'gable', floor: Surface.Wood, doors: [vec(29, 68)], windowEvery: 2, floorHeight: GROUND });
  kit.building('lockup', 'barracks', { min: vec(96, 72), max: vec(102, 78) }, { height: 3, material: 'stone', roof: 'flat', floor: Surface.Stone, doors: [vec(99, 72)], locked: [0], floorHeight: GROUND });
  b.addSolidCircle(vec(52, 70), 1.6, 9);
  b.addProp({ id: 'water-tower', kind: 'water-tower', pos: vec(52, 70), rotation: 0, scale: 1, height: 9, solid: true });
  b.paintSurface(vec(78, 62.6), vec(82, 88), Surface.Gravel); // road to the level crossing
  b.paintSurface(vec(78, 36), vec(82, 39.4), Surface.Gravel);

  // Perimeter fence along the south with the level-crossing gate and a gap by the woods.
  kit.fence('south-west', vec(6, 88), vec(80, 88), GROUND, [vec(80, 88), vec(14, 88)]);
  kit.fence('south-east', vec(80, 88), vec(W - 6, 88), GROUND, [vec(80, 88)]);
  kit.tower('tower-yard', vec(150, 34), GROUND);
  kit.sandbags('sandbags-crossing', vec(83.5, 86), 2.2, false, GROUND);

  // ── Lights and fixtures ───────────────────────────────────────────────────────────────────
  [vec(58, 38.5), vec(73, 38.5), vec(88, 38.5)].forEach((p, i) => kit.lamp(`platform-${i}`, p));
  [vec(84, 64), vec(114, 64), vec(36, 64), vec(84, 86.5)].forEach((p, i) => kit.lamp(`yard-${i}`, p));
  b.addLight({ id: 'window-station', kind: 'window', pos: vec(72, 30), height: 1.5, radius: 12, intensity: 0.45, color: '#ffd9a0' });
  b.addLight({ id: 'window-signal', kind: 'window', pos: vec(103, 31), height: 1.5, radius: 6, intensity: 0.5, color: '#ffd9a0' });
  b.addLight({ id: 'searchlight-yard', kind: 'searchlight', pos: vec(150, 34), height: 6.5, radius: 55, intensity: 1, color: '#f4f1e0' });
  b.addFixture({ type: 'searchlight', id: 'searchlight:yard', pos: vec(150, 34), label: 'Yard searchlight', sector: 'yard', heading: 2.9, sweepArc: 1.2, sweepPeriod: 15, range: 55 });
  b.addFixture({ type: 'alarm-bell', id: 'bell:station', pos: vec(86, 35.5), label: 'Station alarm bell', sector: 'station' });
  b.addFixture({ type: 'alarm-bell', id: 'bell:yard', pos: vec(112, 66), label: 'Yard alarm bell', sector: 'yard' });
  b.addFixture({ type: 'radio', id: 'radio:junction-net', pos: vec(130, 26), label: 'Guardhouse radio', sector: 'station' });
  kit.container('yard-crates', vec(108, 66.5), 2, 'crate');
  kit.container('shed-crates', vec(144.5, 70), 1, 'crate');
  kit.container('woods-bush', vec(22, 92), 1, 'bush');
  kit.clutter(vec(95, 65.5), 3, ['crate', 'barrel', 'fuel-barrel']);
  kit.clutter(vec(46, 35), 2, ['crate', 'barrel']);
  kit.clutter(vec(136, 64.8), 3, ['fuel-barrel', 'barrel']);
  b.addProp({ id: 'truck-station', kind: 'truck', pos: vec(72, 18), rotation: NORTH, scale: 1, height: 2.6, solid: true }, 1.1);

  // ── Woods and fields to the south ─────────────────────────────────────────────────────────
  const keepClear: Rect[] = [
    ...kit.buildingRects.map((r) => ({ min: vec(r.min.x - 2, r.min.z - 2), max: vec(r.max.x + 2, r.max.z + 2) })),
    { min: vec(0, 34), max: vec(W, 89.5) },
    { min: vec(5, 92), max: vec(22, 106) },
    { min: vec(76, 0), max: vec(84, D) },
    { min: vec(56, 0), max: vec(90, 26) },
  ];
  kit.trees({ min: vec(4, 90), max: vec(156, 106) }, 120, 'tree-pine', keepClear);
  kit.trees({ min: vec(4, 4), max: vec(156, 24) }, 60, 'tree-oak', keepClear, 4.5);
  for (let i = 0; i < 30; i += 1) {
    const p = vec(rng.range(8, 152), rng.range(90, 104));
    if (keepClear.some((r) => inRect(p, r))) continue;
    b.addProp({ id: `bush-${i}`, kind: 'bush', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(0.9, 1.4), height: 1.3, solid: false });
    b.addConcealment(p, 1.5, 200);
  }
  for (let i = 0; i < 24; i += 1) {
    const p = vec(rng.range(8, 152), rng.range(66, 87));
    if (keepClear.slice(0, -4).some((r) => inRect(p, r)) || inRect(p, { min: vec(76, 60), max: vec(84, 90) })) continue;
    b.addProp({ id: `grass-${i}`, kind: 'tall-grass', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(1.5, 2.4), height: 0.9, solid: false });
    b.addConcealment(p, rng.range(2, 3.5), 150);
  }
  b.setNoiseFloor(vec(130, 75), 10, 40); // engine shed machinery

  // ── Guards ────────────────────────────────────────────────────────────────────────────────
  const post = (id: string, pos: Vec2, facing: number, extra: { sweepArc?: number; sweepPeriod?: number; elevation?: number } = {}) => b.addPost({ id: `post:${id}`, pos, facing, ...extra });
  post('crossing', vec(83.5, 89.5), SOUTH, { sweepArc: 1.2, sweepPeriod: 10 });
  post('platform', vec(72, 37.6), SOUTH, { sweepArc: 1.6, sweepPeriod: 12 });
  post('signal-door', vec(103, 35.6), SOUTH, { sweepArc: 1.2, sweepPeriod: 10 });
  post('station-inside', vec(64, 30), EAST, { sweepArc: 1.0, sweepPeriod: 12 });
  post('depot-office', vec(31, 72), WEST, { sweepArc: 1.0, sweepPeriod: 11 });
  post('shed-door', vec(130, 66.4), NORTH, { sweepArc: 1.4, sweepPeriod: 10 });
  post('lockup-door', vec(99, 70.4), NORTH, { sweepArc: 1.4, sweepPeriod: 9 });
  post('ammo-west', vec(94, 51), EAST, { sweepArc: 1.2, sweepPeriod: 12 });
  post('ammo-east', vec(147.5, 51), WEST, { sweepArc: 1.2, sweepPeriod: 12 });
  post('guardhouse', vec(125, 32.6), SOUTH, { sweepArc: 1.4, sweepPeriod: 10 });
  post('tower-yard', vec(150, 34), 2.9, { sweepArc: 1.6, sweepPeriod: 16, elevation: 5 });
  const route = (id: string, points: Vec2[], waits: number[]) => b.addRoute({ id: `route:${id}`, points, waits, loop: true });
  route('platform', [vec(56, 38), vec(90, 38)], [4, 4]);
  route('yard-north', [vec(12, 45), vec(80, 45), vec(148, 45), vec(80, 45.5)], [3, 0, 4, 0]);
  route('yard-south', [vec(12, 57), vec(80, 57), vec(148, 57), vec(80, 57.5)], [3, 0, 4, 0]);
  route('fence-line', [vec(16, 85.5), vec(76, 85.5), vec(150, 85.5), vec(76, 86)], [3, 0, 3, 0]);
  route('sheds', [vec(110, 64.5), vec(148, 64.5), vec(148, 85), vec(110, 84)], [2, 2, 2, 2]);

  // ── Zones and slots ───────────────────────────────────────────────────────────────────────
  b.addZone({ id: 'insertion', kind: 'insertion', min: vec(6, 94), max: vec(20, 104), label: 'Woods' });
  b.addZone({ id: 'extraction', kind: 'extraction', min: vec(6, 94), max: vec(20, 104), label: 'Woods' });
  b.addZone({ id: 'holding', kind: 'holding', min: vec(96.7, 72.7), max: vec(101.3, 77.3), label: 'Lock-up' });
  b.addZone({ id: 'signal', kind: 'restricted', min: vec(100.4, 28.4), max: vec(105.6, 33.6), label: 'Signal box' });
  b.addZone({ id: 'station', kind: 'sector', min: vec(0, 0), max: vec(W, 39) });
  b.addZone({ id: 'yard', kind: 'sector', min: vec(0, 39), max: vec(W, 89) });
  b.addZone({ id: 'woods', kind: 'sector', min: vec(0, 89), max: vec(W, D) });

  const slot = (id: string, pos: Vec2, tags: string[], indoor: boolean, facing = 0) => b.addSlot({ id: `slot:${id}`, pos, tags, indoor, facing });
  [vec(10, 97), vec(12, 97.6), vec(14, 97), vec(10.4, 99.6), vec(12.4, 100.2), vec(14.4, 99.6)].forEach((p, i) => slot(`insertion-${i}`, p, ['insertion'], false, -Math.PI / 2));
  slot('ammo-train', vec(105.5, 51.9), ['objective-target'], false);
  slot('signal-console', vec(101.5, 30), ['objective-target'], true);
  slot('fuel-store', vec(138, 64.6), ['objective-target'], false);
  slot('station-office', vec(80, 28.5), ['item'], true);
  slot('depot-desk', vec(26, 74), ['item'], true);
  slot('lockup-cell', vec(99, 76), ['prisoner'], true);
  slot('shed-pit', vec(138, 79), ['prisoner'], true);

  for (const door of kit.doorFronts) b.addSearchNode(door);
  void WEST;
  return b.finalize({ bakeLight: bakeStaticLight });
}
