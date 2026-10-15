import { angleDelta, clamp, distance, headingTo, type Vec2 } from '../core/math';
import { TARGET_HEIGHT, traceSight } from '../sight/los';
import { receivedLevel } from '../sound/propagation';
import { DIFFICULTY } from './rules';
import { DT, type Guard, type NoiseKind, type Operative, type Stance, type Stimulus, type SuspicionEntry } from './types';
import type { World } from './world';

const DEG = Math.PI / 180;
/** Suspicion gained per second at a visibility factor of 1. */
export const SUSPICION_RATE = 140;
export const SUSPICION_MAX = 120;
/** Thresholds driving the guard state machine. */
export const THRESHOLD = { observe: 15, suspicious: 45, investigate: 75, detected: 100 } as const;
/** Guards always notice someone this close, whatever way they face. */
const PROXIMITY_SENSE = 1.4;

export const NOISE_SALIENCE: Record<NoiseKind, number> = {
  footstep: 30,
  door: 25,
  tool: 35,
  'body-fall': 60,
  scuffle: 65,
  impact: 55,
  device: 60,
  'suppressed-shot': 75,
  harpoon: 60,
  gunshot: 100,
  explosion: 100,
  shout: 70,
  'alarm-shout': 95,
};

const ALERT_STATES = new Set(['alerted', 'combat', 'search', 'investigate', 'challenge']);

export interface VisionParams {
  fov: number;
  near: number;
  far: number;
  eyeY: number;
}

export function visionParams(world: World, g: Guard): VisionParams {
  const alert = ALERT_STATES.has(g.state) || g.alertness >= 0.5;
  let far = 20;
  const weather = world.state.env.weather;
  if (weather === 'fog') far *= 0.65;
  else if (weather === 'rain' || weather === 'snow') far *= 0.85;
  return {
    fov: (alert ? 120 : 100) * DEG,
    near: alert ? 9 : 7,
    far,
    eyeY: world.grid.heightAt(g.pos) + 1.6 + g.eyeElevation,
  };
}

/** Light level 0..1 at a position: ambient + static lamps + lanterns + searchlight beams. */
export function lightAt(world: World, pos: Vec2): number {
  const s = world.state;
  const cell = world.grid.cellAt(pos);
  let light = s.env.ambientLight + (cell >= 0 ? world.level.staticLight[cell]! / 255 : 0);
  if (light >= 1) return 1;
  for (const g of s.guards) {
    if (!g.carriesLantern || g.status !== 'active') continue;
    const d = distance(g.pos, pos);
    if (d < 7) light += (1 - d / 7) * 0.55;
  }
  for (const obj of s.objects) {
    if (obj.type !== 'searchlight' || obj.sabotaged || obj.destroyed || obj.heading === undefined) continue;
    const d = distance(obj.pos, pos);
    if (d > (obj.range ?? 40) || d < 1) continue;
    if (Math.abs(angleDelta(obj.heading, headingTo(obj.pos, pos))) > 9 * DEG) continue;
    const beam = traceSight(world.sight, obj.pos, world.grid.heightAt(obj.pos) + 6, pos, world.grid.heightAt(pos) + 1);
    if (beam.clear) light += 0.85;
  }
  return Math.min(1, light);
}

export interface VisibilityInput {
  distance: number;
  near: number;
  far: number;
  stance: Stance;
  motion: 'still' | 'walk' | 'run';
  light: number;
  concealment: number;
}

/**
 * How conspicuous a target is (0 = invisible). Implements the two-zone model: in the near zone a
 * target is seen in any stance; in the far zone crouching is slow to detect and prone is invisible.
 */
export function visibilityFactor(v: VisibilityInput): number {
  if (v.distance > v.far) return 0;
  const inNear = v.distance <= v.near;
  const zone = inNear ? 1 : 1 - (0.5 * (v.distance - v.near)) / Math.max(0.01, v.far - v.near);
  const stance = v.stance === 'stand' ? 1 : v.stance === 'crouch' ? (inNear ? 0.8 : 0.35) : inNear ? 0.55 : 0;
  const light = inNear ? Math.max(0.6, 0.3 + 0.7 * v.light) : 0.2 + 0.8 * v.light;
  const conceal = v.stance === 'stand' ? 1 - 0.2 * v.concealment : 1 - 0.85 * v.concealment;
  const motion = v.motion === 'still' ? 0.7 : v.motion === 'run' ? 1.4 : 1;
  return clamp(zone * stance * light * conceal * motion, 0, 2);
}

export interface SeeResult {
  visible: boolean;
  distance: number;
  concealment: number;
}

/** Field-of-view, range and exact line-of-sight test from a guard's eye to a point. */
export function guardCanSee(world: World, g: Guard, pos: Vec2, heightAboveGround: number, params = visionParams(world, g)): SeeResult {
  const d = distance(g.pos, pos);
  if (d > params.far) return { visible: false, distance: d, concealment: 0 };
  if (d > PROXIMITY_SENSE) {
    const off = Math.abs(angleDelta(g.facing + g.look, headingTo(g.pos, pos)));
    if (off > params.fov / 2) return { visible: false, distance: d, concealment: 0 };
  }
  const sight = traceSight(world.sight, g.pos, params.eyeY, pos, world.grid.heightAt(pos) + heightAboveGround);
  return { visible: sight.clear, distance: d, concealment: sight.concealment };
}

function operativeHeight(op: Operative): number {
  if (op.status === 'downed') return TARGET_HEIGHT.prone;
  return TARGET_HEIGHT[op.stance];
}

/** Whether a disguised operative is currently doing something that gives them away. */
export function actsSuspicious(world: World, op: Operative, observer: Guard, d: number): boolean {
  const s = world.state;
  if (op.carrying || s.tick < op.suspiciousUntil) return true;
  if (op.stance !== 'stand') return true;
  if (op.lastMoveTick === s.tick && op.lastGait === 'run' && d < 12) return true;
  const zone = world.restrictedZoneAt(op.pos);
  return Boolean(zone) && observer.sector === zone;
}

function entryFor(g: Guard, targetId: string): SuspicionEntry {
  let entry = g.suspicion.find((e) => e.targetId === targetId);
  if (!entry) {
    entry = { targetId, value: 0, lastSeen: { x: 0, z: 0 }, lastSeenTick: -1 };
    g.suspicion.push(entry);
  }
  return entry;
}

export function bestSuspicion(g: Guard): SuspicionEntry | null {
  let best: SuspicionEntry | null = null;
  for (const e of g.suspicion) if (!best || e.value > best.value) best = e;
  return best;
}

/** Records a stimulus; it becomes the guard's focus if it is at least as salient as the current one. */
export function pushStimulus(world: World, g: Guard, stimulus: Stimulus): void {
  g.memory.push(stimulus);
  if (g.memory.length > 6) g.memory.shift();
  const current = g.focus;
  const stale = !current || world.state.tick - current.tick > 160;
  if (stale || stimulus.salience >= current!.salience) g.focus = stimulus;
}

function perceptionInterval(world: World, g: Guard): number {
  let nearest = Infinity;
  for (const op of world.state.operatives) {
    if (op.status === 'active' || op.status === 'downed') nearest = Math.min(nearest, distance(op.pos, g.pos));
  }
  return nearest <= 40 ? 1 : nearest <= 80 ? 2 : 4;
}

function idPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function seeOperatives(world: World, g: Guard, params: VisionParams, elapsed: number): void {
  const s = world.state;
  const rules = DIFFICULTY[s.difficulty];
  const distracted = g.state === 'distracted';
  const gain = SUSPICION_RATE * elapsed * rules.detection * (1 + g.alertness * 0.5);

  const consider = (id: string, pos: Vec2, height: number, factorFor: (see: SeeResult) => number) => {
    const entry = entryFor(g, id);
    const see = guardCanSee(world, g, pos, height, params);
    let factor = see.visible ? factorFor(see) : 0;
    if (distracted && see.distance > 2) factor *= 0.15;
    if (factor > 0) {
      entry.value = Math.min(SUSPICION_MAX, entry.value + gain * factor);
      entry.lastSeen = { ...pos };
      entry.lastSeenTick = s.tick;
    } else {
      entry.value = Math.max(0, entry.value - rules.decay * elapsed);
    }
  };

  for (const op of s.operatives) {
    if (op.status !== 'active' && op.status !== 'downed') continue;
    if (op.escortedBy) continue;
    consider(op.id, op.pos, operativeHeight(op), (see) => {
      const motion = op.lastMoveTick >= s.tick - 1 ? (op.lastGait === 'run' && op.stance !== 'prone' ? 'run' : 'walk') : 'still';
      let factor = visibilityFactor({
        distance: see.distance,
        near: params.near,
        far: params.far,
        stance: op.status === 'downed' ? 'prone' : op.stance,
        motion,
        light: lightAt(world, op.pos),
        concealment: see.concealment,
      });
      if (op.carrying) factor *= 1.3;
      if (op.submerged) factor = see.distance <= params.near ? factor * 0.3 : 0;
      if (op.disguised && op.status === 'active' && !actsSuspicious(world, op, g, see.distance)) {
        factor = g.rank === 'officer' && see.distance <= 5 ? factor * 0.35 : 0;
      }
      return factor;
    });
  }
  // A freed prisoner walking around is an obvious intruder.
  for (const obj of s.objects) {
    if (obj.type !== 'prisoner' || !obj.freed || obj.extracted || !obj.alive) continue;
    consider(obj.id, obj.pos, TARGET_HEIGHT.stand, (see) =>
      visibilityFactor({ distance: see.distance, near: params.near, far: params.far, stance: 'stand', motion: 'walk', light: lightAt(world, obj.pos), concealment: see.concealment }),
    );
  }
}

function seeEvidence(world: World, g: Guard, params: VisionParams): void {
  const s = world.state;
  for (const body of s.guards) {
    if (body === g || body.status === 'active' || body.found || body.hiddenIn || body.carriedBy) continue;
    if (distance(body.pos, g.pos) > params.far) continue;
    if (guardCanSee(world, g, body.pos, 0.3, params).visible) {
      pushStimulus(world, g, { kind: 'body', pos: { ...body.pos }, tick: s.tick, salience: 90, sourceId: body.id });
    }
  }
  const rules = DIFFICULTY[s.difficulty];
  const maxAge = rules.footprintSeconds * 20;
  for (let i = s.footprints.length - 1, checked = 0; i >= 0 && checked < 24; i -= 1) {
    const fp = s.footprints[i]!;
    if (s.tick - fp.tick > maxAge) break;
    if (distance(fp.pos, g.pos) > params.near + 3) continue;
    checked += 1;
    if (guardCanSee(world, g, fp.pos, 0.05, params).visible) {
      pushStimulus(world, g, { kind: 'tracks', pos: { ...fp.pos }, tick: s.tick, salience: 35, sourceId: fp.ownerId });
      break;
    }
  }
  for (const cloud of s.smoke) {
    if (distance(cloud.pos, g.pos) <= params.far && guardCanSee(world, g, cloud.pos, 1.5, params).visible) {
      pushStimulus(world, g, { kind: 'sight', pos: { ...cloud.pos }, tick: s.tick, salience: 45, sourceId: cloud.id });
    }
  }
}

function hear(world: World, g: Guard, noises: World['state']['noises']): void {
  const s = world.state;
  const rules = DIFFICULTY[s.difficulty];
  const cell = world.grid.cellAt(g.pos);
  const floor = Math.max(s.env.noiseFloor, cell >= 0 ? world.level.noiseFloor[cell]! : 0);
  const alert = ALERT_STATES.has(g.state);
  const threshold = floor + rules.hearingMargin - (alert ? 3 : 0) + (g.state === 'distracted' ? 8 : 0);
  for (const noise of noises) {
    if (noise.sourceId === g.id) continue;
    if (noise.sourceId?.startsWith('g:') && (noise.kind === 'footstep' || noise.kind === 'door')) continue;
    const level = receivedLevel(world.sound, noise.pos, noise.db, g.pos);
    if (level < threshold) continue;
    const d = distance(noise.pos, g.pos);
    const spread = clamp(d * 0.08, 0.3, 4);
    const pos = { x: noise.pos.x + world.rng.range(-spread, spread), z: noise.pos.z + world.rng.range(-spread, spread) };
    pushStimulus(world, g, { kind: 'noise', pos, tick: s.tick, salience: NOISE_SALIENCE[noise.kind], sourceId: noise.sourceId, noise: noise.kind });
  }
}

/** Runs vision and hearing for every guard whose (distance-scaled) perception tick is due. */
export function updatePerception(world: World): void {
  const s = world.state;
  const heard = s.noises.filter((n) => n.tick < s.tick);
  s.noises = s.noises.filter((n) => n.tick >= s.tick);

  for (const g of s.guards) {
    if (g.status !== 'active') continue;
    const interval = perceptionInterval(world, g);
    // Hearing is cheap and time-critical: every guard hears every tick.
    if (heard.length > 0) hear(world, g, heard);
    if ((s.tick + idPhase(g.id)) % interval !== 0 && g.lastPerceptionTick >= 0) continue;
    const elapsed = Math.max(1, s.tick - Math.max(0, g.lastPerceptionTick)) * DT;
    g.lastPerceptionTick = s.tick;
    const params = visionParams(world, g);
    seeOperatives(world, g, params, elapsed);
    seeEvidence(world, g, params);
  }

  for (const op of s.operatives) {
    op.noticedBy = s.guards
      .filter((g) => g.status === 'active' && (g.suspicion.find((e) => e.targetId === op.id)?.value ?? 0) >= THRESHOLD.observe)
      .map((g) => g.id);
  }
}

/** True if any active guard can currently see the operative. */
export function isObservedBy(world: World, op: Operative): boolean {
  return world.state.guards.some((g) => g.status === 'active' && guardCanSee(world, g, op.pos, operativeHeight(op)).visible);
}
