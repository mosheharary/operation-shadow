import { vec, type Vec2 } from '../core/math';
import { Rng } from '../core/rng';
import { LevelBuilder } from '../level/builder';
import { type LevelData, Surface } from '../level/types';
import { EAST, LevelKit, NORTH } from './kit';
import { bakeStaticLight } from './lighting';
import { fbm } from './noise';

export const TRAINING_TEMPLATE_ID = 'training-ground';
export const TRAINING_GENERATOR_VERSION = 'training@1';

const W = 72;
const D = 48;
const GROUND = 1;

/**
 * "Boot Camp" training ground, laid out west to east as a sequence of lessons: move, crouch
 * through grass past a watching sentry, knock out a sentry from behind, tie him up and hide him,
 * pick a lock and take the papers, slip past or cut through the fence, and extract.
 */
export function generateTraining(options: { seed: number; id?: string }): LevelData {
  const seed = options.seed >>> 0;
  const rng = Rng.fromSeed(seed ^ 0x7ea);
  const b = new LevelBuilder({ id: options.id ?? `training-${seed}`, templateId: TRAINING_TEMPLATE_ID, seed, generatorVersion: TRAINING_GENERATOR_VERSION, width: W, depth: D, seaLevel: -30 });
  const kit = new LevelKit(b, rng);
  b.setHeight((x, z) => GROUND + 0.25 * (fbm(x / 18, z / 18, seed) - 0.5) + (z < 3 || z > D - 3 || x < 2 ? 0.8 : 0));
  b.forRect(vec(0, 0), vec(W, D), (cell) => b.setSurface(cell, Surface.Grass));
  b.paintSurface(vec(2, 28), vec(58, 34), Surface.Dirt); // the main track

  // Lesson 2: a dense tall-grass field watched from the north-east.
  let tuft = 0;
  for (let x = 18; x <= 32; x += 2) {
    for (let z = 10; z <= 24; z += 2) {
      const p = vec(x + rng.range(-0.6, 0.6), z + rng.range(-0.6, 0.6));
      b.addProp({ id: `grass-${tuft++}`, kind: 'tall-grass', pos: p, rotation: rng.range(0, 6.28), scale: rng.range(1.8, 2.5), height: 0.9, solid: false });
      b.addConcealment(p, 1.8, 200);
    }
  }
  // Lessons 3–4: a sentry by the crates with his back to the track, and a crate to hide him in.
  kit.container('drill-crate', vec(48.5, 10.5), 1, 'crate');
  kit.clutter(vec(51, 7), 2, ['crate', 'barrel'], 1);
  // Lesson 5: locked armory with the training papers.
  kit.building('armory', 'barracks', { min: vec(48, 35), max: vec(56, 42) }, { height: 3.2, material: 'stone', roof: 'gable', floor: Surface.Wood, doors: [vec(48, 38.5)], locked: [0], floorHeight: GROUND });
  kit.building('mess-hall', 'barracks', { min: vec(8, 38), max: vec(18, 44) }, { height: 3.2, material: 'timber', roof: 'gable', floor: Surface.Wood, doors: [vec(13, 38)], windowEvery: 2, floorHeight: GROUND });
  // Lesson 6: the perimeter fence with a guarded gate (or cut a quiet section).
  kit.fence('east', vec(60, 3), vec(60, D - 3), GROUND, [vec(60, 30)]);
  kit.tower('tower-range', vec(67, 6), GROUND);
  kit.sandbags('sandbags-gate', vec(61.2, 26.4), 2, true, GROUND);
  for (const [i, p] of [vec(5, 6), vec(5, 45), vec(36, 45), vec(34, 5), vec(70, 22)].entries()) b.addProp({ id: `oak-${i}`, kind: 'tree-oak', pos: p, rotation: rng.range(0, 6), scale: 1, height: 8, solid: true }, 0.5);
  kit.clutter(vec(24, 41), 3, ['crate', 'barrel']);
  b.addProp({ id: 'truck-camp', kind: 'truck', pos: vec(38, 40), rotation: EAST, scale: 1, height: 2.6, solid: true }, 1.1);
  kit.lamp('gate', vec(58, 26));
  kit.lamp('mess', vec(19, 36.5));

  // Guards (placements chosen so each lesson is solvable without being seen).
  // Faces south-west over the grass; the route east to the drill yard stays outside his view.
  b.addPost({ id: 'post:field', pos: vec(34, 4), facing: (3 * Math.PI) / 4 });
  b.addPost({ id: 'post:drill', pos: vec(45, 15), facing: NORTH });
  // Stands outside the gate watching the road north, his back to the camp.
  b.addPost({ id: 'post:gate', pos: vec(63, 30), facing: NORTH });
  b.addRoute({ id: 'route:camp', points: [vec(40, 43.5), vec(58, 43.5)], waits: [5, 5], loop: true });

  b.addZone({ id: 'insertion', kind: 'insertion', min: vec(3, 28), max: vec(11, 34), label: 'Start' });
  b.addZone({ id: 'extraction', kind: 'extraction', min: vec(63, 36), max: vec(70, 46), label: 'Pick-up point' });
  b.addZone({ id: 'camp', kind: 'sector', min: vec(0, 0), max: vec(W, D) });
  const slot = (id: string, pos: Vec2, tags: string[], indoor: boolean, facing = 0) => b.addSlot({ id: `slot:${id}`, pos, tags, indoor, facing });
  [vec(5, 30), vec(7, 30.6), vec(5, 32.4), vec(7, 33)].forEach((p, i) => slot(`insertion-${i}`, p, ['insertion'], false, 0));
  slot('armory-papers', vec(53.5, 38.5), ['item'], true);
  slot('marker-move', vec(16, 31), ['marker'], false);
  slot('marker-grass', vec(30, 14), ['marker'], false);
  slot('marker-drill', vec(42, 15), ['marker'], false);
  for (const door of kit.doorFronts) b.addSearchNode(door);
  return b.finalize({ bakeLight: bakeStaticLight });
}
