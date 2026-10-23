import { angleDelta, distance, headingTo, type Vec2 } from '../core/math';
import { CellFlag } from '../level/types';
import { TARGET_HEIGHT, traceSight } from '../sight/los';
import { OK, reject, type CommandResult } from './commands';
import { spyCoverIntact } from './perception';
import { DIFFICULTY, NOISE_DB, SPECIALIST_RULES } from './rules';
import {
  type AbilityId,
  type AbilityTarget,
  type ChargeObject,
  type Guard,
  type ItemId,
  type Operative,
  type Stance,
  type WorldObject,
  seconds,
} from './types';
import type { World } from './world';

export type ResolvedTarget =
  | { kind: 'guard'; guard: Guard; pos: Vec2 }
  | { kind: 'ally'; op: Operative; pos: Vec2 }
  | { kind: 'object'; obj: WorldObject; pos: Vec2 }
  | { kind: 'point'; pos: Vec2 }
  | { kind: 'self'; pos: Vec2 };

type TargetKind = 'guard' | 'body' | 'ally' | 'object' | 'point' | 'self';

export interface AbilityDef {
  id: AbilityId;
  target: TargetKind;
  objectTypes?: WorldObject['type'][];
  /** Maximum distance from which the ability executes. */
  range: number;
  /** Walk into range automatically. */
  approach: boolean;
  /** Requires a clear sight line (ranged abilities). */
  los: boolean;
  /** Seconds the operative is busy. */
  duration: number;
  cooldown: number;
  item?: ItemId;
  /** The item is consumed on use (default true when `item` is set). */
  consume?: boolean;
  /** Effect happens when the action starts (grabs) rather than when it completes. */
  instant?: boolean;
  allowCarrying?: boolean;
  /** Stance forced at execution (e.g. melee takes a crouch). */
  stance?: Stance;
  /** Doing this while disguised in view of a guard blows the cover. */
  suspicious?: boolean;
  check?: (world: World, op: Operative, target: ResolvedTarget) => CommandResult;
  apply: (world: World, op: Operative, target: ResolvedTarget) => void;
}

const MELEE_RANGE = 1.3;
/** How long a chat with the spy holds a soldier's attention. */
export const SPY_CHAT_SECONDS = 10;
const FRONT_ARC = (70 * Math.PI) / 180;

const isBody = (g: Guard) => g.status !== 'active' && g.carriedBy === null && g.hiddenIn === null;

/** True if the guard is looking toward the operative (within its frontal arc). */
export function guardFaces(guard: Guard, pos: Vec2): boolean {
  return Math.abs(angleDelta(guard.facing + guard.look, headingTo(guard.pos, pos))) < FRONT_ARC;
}

function meleeCheck(world: World, op: Operative, target: ResolvedTarget, frontAllowedIf?: (g: Guard) => boolean): CommandResult {
  if (target.kind !== 'guard') return reject('invalid-target', 'Choose an enemy soldier');
  const g = target.guard;
  if (g.status !== 'active') return reject('invalid-target', 'That soldier is already down');
  if (g.state === 'combat' && g.targetId === op.id) return reject('condition', 'He has you in his sights');
  if (guardFaces(g, op.pos) && !(frontAllowedIf?.(g) ?? false) && g.state !== 'distracted') {
    return reject('condition', 'He would see you coming. Approach from behind');
  }
  return OK;
}

function knockOut(world: World, op: Operative, guard: Guard, noiseDb: number): void {
  world.disableGuard(guard, 'ko');
  world.noise(guard.pos, noiseDb, 'scuffle', op.id);
  world.state.stats.knockouts += 1;
}

function kill(world: World, op: Operative, guard: Guard, noiseDb: number, kind: 'scuffle' | 'harpoon' | 'suppressed-shot' | 'gunshot' = 'scuffle'): void {
  world.disableGuard(guard, 'dead');
  if (noiseDb > 0) world.noise(guard.pos, noiseDb, kind, op.id);
  world.state.stats.kills += 1;
}

function rangedShot(world: World, op: Operative, guard: Guard, weapon: string, baseHit: number, maxRange: number): boolean {
  const d = distance(op.pos, guard.pos);
  const hitChance = Math.max(0.05, baseHit * (1 - (d / maxRange) * 0.35));
  const hit = world.rng.chance(hitChance);
  world.state.stats.shotsFired += 1;
  world.emit({ type: 'shot', shooterId: op.id, targetId: guard.id, hit, weapon, from: op.pos, to: guard.pos });
  return hit;
}

function alertShotTarget(world: World, op: Operative, guard: Guard): void {
  // A target that survives a shot knows exactly where it came from.
  if (guard.status === 'active') world.alertGuardTo(guard, op.id, op.pos);
}

/** Ammunition and the ability that fires it. Resupply only hands over what the receiver can shoot. */
const AMMO: [ItemId, AbilityId][] = [
  ['pistol-round', 'pistol'],
  ['rifle-round', 'rifle'],
  ['harpoon-bolt', 'harpoon'],
];

/**
 * What `giver` would hand `receiver`: every round of a type the giver cannot fire, half (rounded up)
 * of one it shares.
 */
export function resupplyLoad(giver: Operative, receiver: Operative): Partial<Record<ItemId, number>> {
  const load: Partial<Record<ItemId, number>> = {};
  for (const [item, weapon] of AMMO) {
    const have = giver.inventory[item] ?? 0;
    if (have <= 0 || !SPECIALIST_RULES[receiver.role].abilities.includes(weapon)) continue;
    load[item] = SPECIALIST_RULES[giver.role].abilities.includes(weapon) ? Math.ceil(have / 2) : have;
  }
  return load;
}

const AMMO_NAMES: Partial<Record<ItemId, [string, string]>> = {
  'pistol-round': ['pistol round', 'pistol rounds'],
  'rifle-round': ['rifle round', 'rifle rounds'],
  'harpoon-bolt': ['harpoon bolt', 'harpoon bolts'],
};

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  takedown: {
    id: 'takedown',
    target: 'guard',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 1.2,
    cooldown: 0,
    instant: true,
    stance: 'crouch',
    suspicious: true,
    check: (w, op, t) => meleeCheck(w, op, t),
    apply: (w, op, t) => t.kind === 'guard' && knockOut(w, op, t.guard, NOISE_DB.scuffle),
  },
  chloroform: {
    id: 'chloroform',
    target: 'guard',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 2,
    cooldown: 0,
    item: 'chloroform',
    instant: true,
    stance: 'crouch',
    suspicious: true,
    check: (w, op, t) => meleeCheck(w, op, t),
    apply: (w, op, t) => t.kind === 'guard' && knockOut(w, op, t.guard, 34),
  },
  sedative: {
    id: 'sedative',
    target: 'guard',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 1,
    cooldown: 0,
    item: 'sedative',
    instant: true,
    suspicious: true,
    // A disguised Deception Specialist can sedate a relaxed soldier face to face.
    check: (w, op, t) =>
      meleeCheck(w, op, t, (g) => op.disguised && (g.state === 'post' || g.state === 'patrol' || g.distractedBy === op.id)),
    apply: (w, op, t) => t.kind === 'guard' && knockOut(w, op, t.guard, 28),
  },
  knife: {
    id: 'knife',
    target: 'guard',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 1,
    cooldown: 0,
    instant: true,
    stance: 'crouch',
    suspicious: true,
    check: (w, op, t) => meleeCheck(w, op, t),
    apply: (w, op, t) => t.kind === 'guard' && kill(w, op, t.guard, NOISE_DB.knife),
  },
  restrain: {
    id: 'restrain',
    target: 'body',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 3,
    cooldown: 0,
    item: 'rope',
    suspicious: true,
    check: (_w, _op, t) =>
      t.kind === 'guard' && t.guard.status === 'ko' ? OK : reject('invalid-target', 'Only an unconscious soldier can be tied up'),
    apply: (w, _op, t) => {
      if (t.kind !== 'guard' || t.guard.status !== 'ko') return;
      t.guard.status = 'restrained';
      w.state.stats.restrained += 1;
      w.emit({ type: 'guard-status', guardId: t.guard.id, status: 'restrained' });
    },
  },
  carry: {
    id: 'carry',
    target: 'body',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 0.8,
    cooldown: 0,
    suspicious: true,
    apply: (_w, op, t) => {
      if (t.kind !== 'guard' || !isBody(t.guard)) return;
      op.carrying = t.guard.id;
      t.guard.carriedBy = op.id;
      if (op.stance === 'prone') op.stance = 'crouch';
      op.gait = 'walk';
    },
  },
  drop: {
    id: 'drop',
    target: 'self',
    range: 0,
    approach: false,
    los: false,
    duration: 0.5,
    cooldown: 0,
    allowCarrying: true,
    check: (_w, op) => (op.carrying ? OK : reject('condition', 'Not carrying anyone')),
    apply: (w, op) => {
      const body = op.carrying ? w.guard(op.carrying) : undefined;
      if (!body) return;
      body.carriedBy = null;
      body.pos = { ...op.pos };
      op.carrying = null;
      w.noise(op.pos, 34, 'body-fall', op.id);
    },
  },
  'hide-body': {
    id: 'hide-body',
    target: 'object',
    objectTypes: ['container'],
    range: 1.5,
    approach: true,
    los: false,
    duration: 1.5,
    cooldown: 0,
    allowCarrying: true,
    check: (_w, op, t) => {
      if (!op.carrying) return reject('condition', 'Carry a body here first');
      if (t.kind !== 'object' || t.obj.type !== 'container') return reject('invalid-target', 'Choose a hiding place');
      return t.obj.contents.length < t.obj.capacity ? OK : reject('condition', 'No room left in there');
    },
    apply: (w, op, t) => {
      const body = op.carrying ? w.guard(op.carrying) : undefined;
      if (!body || t.kind !== 'object' || t.obj.type !== 'container') return;
      t.obj.contents.push(body.id);
      body.hiddenIn = t.obj.id;
      body.carriedBy = null;
      body.pos = { ...t.obj.pos };
      op.carrying = null;
    },
  },
  door: {
    id: 'door',
    target: 'object',
    objectTypes: ['door'],
    range: 1.4,
    approach: true,
    los: false,
    duration: 0.4,
    cooldown: 0,
    allowCarrying: true,
    check: (_w, _op, t) =>
      t.kind === 'object' && t.obj.type === 'door' && t.obj.locked ? reject('condition', 'Locked. The Combat Engineer can pick it') : OK,
    apply: (w, op, t) => {
      if (t.kind !== 'object' || t.obj.type !== 'door' || t.obj.locked) return;
      w.setDoor(t.obj, !t.obj.open, op.id);
    },
  },
  lockpick: {
    id: 'lockpick',
    target: 'object',
    objectTypes: ['door'],
    range: 1.4,
    approach: true,
    los: false,
    duration: 4,
    cooldown: 0,
    item: 'lockpick',
    consume: false,
    suspicious: true,
    check: (_w, _op, t) => (t.kind === 'object' && t.obj.type === 'door' && t.obj.locked ? OK : reject('condition', 'That door is not locked')),
    apply: (w, op, t) => {
      if (t.kind !== 'object' || t.obj.type !== 'door') return;
      t.obj.locked = false;
      w.noise(t.obj.pos, NOISE_DB.tool, 'tool', op.id);
      w.setDoor(t.obj, true, op.id);
    },
  },
  'cut-fence': {
    id: 'cut-fence',
    target: 'object',
    objectTypes: ['fence'],
    range: 1.6,
    approach: true,
    los: false,
    duration: 3,
    cooldown: 0,
    item: 'wire-cutters',
    consume: false,
    suspicious: true,
    check: (_w, _op, t) => (t.kind === 'object' && t.obj.type === 'fence' && t.obj.cutCells.length === 0 ? OK : reject('condition', 'Already cut')),
    apply: (w, op, t) => {
      if (t.kind !== 'object' || t.obj.type !== 'fence') return;
      w.cutFence(t.obj, t.pos);
      w.noise(op.pos, NOISE_DB.tool, 'tool', op.id);
    },
  },
  sabotage: {
    id: 'sabotage',
    target: 'object',
    objectTypes: ['alarm-bell', 'radio', 'searchlight', 'objective-target'],
    range: 1.6,
    approach: true,
    los: false,
    duration: 5,
    cooldown: 0,
    suspicious: true,
    check: (_w, _op, t) =>
      t.kind === 'object' && 'sabotaged' in t.obj && !t.obj.sabotaged && !t.obj.destroyed ? OK : reject('condition', 'Already disabled'),
    apply: (w, op, t) => {
      if (t.kind !== 'object' || !('sabotaged' in t.obj)) return;
      t.obj.sabotaged = true;
      w.noise(t.obj.pos, NOISE_DB.tool, 'tool', op.id);
      w.log('success', `${t.obj.label} sabotaged`);
    },
  },
  'place-charge': {
    id: 'place-charge',
    target: 'point',
    range: 1.6,
    approach: true,
    los: false,
    duration: 3,
    cooldown: 0,
    item: 'charge',
    suspicious: true,
    apply: (w, op, t) => {
      const charge: ChargeObject = { id: w.newId('charge'), type: 'charge', pos: { ...t.pos }, owner: op.id, detonateAt: w.state.tick + seconds(10) };
      w.state.objects.push(charge);
      w.indexObject(charge);
      w.log('warning', 'Charge set: 10 seconds');
    },
  },
  'pick-up': {
    id: 'pick-up',
    target: 'object',
    objectTypes: ['item', 'device'],
    range: 1.3,
    approach: true,
    los: false,
    duration: 0.6,
    cooldown: 0,
    allowCarrying: true,
    check: (_w, op, t) => {
      if (t.kind !== 'object') return reject('invalid-target', 'Nothing to pick up');
      if (t.obj.type === 'item' && t.obj.takenBy) return reject('condition', 'Already taken');
      if (t.obj.type === 'device' && t.obj.owner !== op.id) return reject('condition', 'Not your device');
      return OK;
    },
    apply: (w, op, t) => {
      if (t.kind !== 'object') return;
      if (t.obj.type === 'item') {
        t.obj.takenBy = op.id;
        op.inventory[t.obj.item] = (op.inventory[t.obj.item] ?? 0) + t.obj.amount;
        w.log('success', `Picked up ${t.obj.item}`);
      } else if (t.obj.type === 'device') {
        op.inventory['noise-device'] = (op.inventory['noise-device'] ?? 0) + 1;
        w.removeObject(t.obj.id);
      }
    },
  },
  'throw-stone': {
    id: 'throw-stone',
    target: 'point',
    range: 12,
    approach: false,
    los: false,
    duration: 0.6,
    cooldown: 1,
    item: 'stone',
    allowCarrying: false,
    check: (w, op, t) =>
      // A lob clears low walls and crates but not buildings.
      traceSight(w.sight, op.pos, w.grid.heightAt(op.pos) + 2.6, t.pos, w.grid.heightAt(t.pos) + 2.6).clear
        ? OK
        : reject('no-line-of-sight', 'Something is in the way'),
    apply: (w, op, t) => {
      const scatter = { x: t.pos.x + w.rng.range(-0.6, 0.6), z: t.pos.z + w.rng.range(-0.6, 0.6) };
      w.noise(scatter, NOISE_DB.impact, 'impact', op.id);
    },
  },
  'place-device': {
    id: 'place-device',
    target: 'self',
    range: 0,
    approach: false,
    los: false,
    duration: 1,
    cooldown: 0,
    item: 'noise-device',
    apply: (w, op) => {
      const device = { id: w.newId('device'), type: 'device' as const, pos: { ...op.pos }, owner: op.id, triggers: 0 };
      w.state.objects.push(device);
      w.indexObject(device);
    },
  },
  'trigger-device': {
    id: 'trigger-device',
    target: 'object',
    objectTypes: ['device'],
    range: Infinity,
    approach: false,
    los: false,
    duration: 0.2,
    cooldown: 2,
    allowCarrying: true,
    check: (_w, op, t) => (t.kind === 'object' && t.obj.type === 'device' && t.obj.owner === op.id ? OK : reject('invalid-target', 'Choose your noise device')),
    apply: (w, op, t) => {
      if (t.kind !== 'object' || t.obj.type !== 'device') return;
      t.obj.triggers += 1;
      w.noise(t.obj.pos, NOISE_DB.device, 'device', op.id);
    },
  },
  binoculars: {
    id: 'binoculars',
    target: 'guard',
    range: 70,
    approach: false,
    los: true,
    duration: 0.5,
    cooldown: 0,
    apply: (w, _op, t) => {
      if (t.kind !== 'guard') return;
      t.guard.tagged = true;
      w.log('info', 'Enemy tagged');
    },
  },
  rifle: {
    id: 'rifle',
    target: 'guard',
    range: 60,
    approach: false,
    los: true,
    duration: 0.8,
    cooldown: 1.5,
    item: 'rifle-round',
    suspicious: true,
    check: (_w, _op, t) => (t.kind === 'guard' && t.guard.status === 'active' ? OK : reject('invalid-target', 'Choose an active enemy')),
    apply: (w, op, t) => {
      if (t.kind !== 'guard' || t.guard.status !== 'active') return;
      w.noise(op.pos, NOISE_DB.suppressedShot, 'suppressed-shot', op.id);
      if (rangedShot(w, op, t.guard, 'rifle', 0.95, 60)) kill(w, op, t.guard, 0);
      else alertShotTarget(w, op, t.guard);
    },
  },
  dart: {
    id: 'dart',
    target: 'guard',
    range: 35,
    approach: false,
    los: true,
    duration: 0.8,
    cooldown: 1.5,
    item: 'dart',
    suspicious: true,
    check: (_w, _op, t) => (t.kind === 'guard' && t.guard.status === 'active' ? OK : reject('invalid-target', 'Choose an active enemy')),
    apply: (w, op, t) => {
      if (t.kind !== 'guard' || t.guard.status !== 'active') return;
      w.noise(op.pos, NOISE_DB.dart, 'suppressed-shot', op.id);
      if (rangedShot(w, op, t.guard, 'dart', 0.9, 35)) knockOut(w, op, t.guard, 30);
      else alertShotTarget(w, op, t.guard);
    },
  },
  pistol: {
    id: 'pistol',
    target: 'guard',
    range: 30,
    approach: false,
    los: true,
    duration: 0.5,
    cooldown: 0.6,
    item: 'pistol-round',
    suspicious: true,
    check: (_w, _op, t) => (t.kind === 'guard' && t.guard.status === 'active' ? OK : reject('invalid-target', 'Choose an active enemy')),
    apply: (w, op, t) => {
      if (t.kind !== 'guard' || t.guard.status !== 'active') return;
      w.noise(op.pos, NOISE_DB.gunshot, 'gunshot', op.id);
      if (rangedShot(w, op, t.guard, 'pistol', 0.8, 40)) {
        t.guard.health -= w.rng.int(60, 81);
        w.emit({ type: 'damage', targetId: t.guard.id, amount: 70 });
        if (t.guard.health <= 0) kill(w, op, t.guard, 0);
        else alertShotTarget(w, op, t.guard);
      } else alertShotTarget(w, op, t.guard);
    },
  },
  harpoon: {
    id: 'harpoon',
    target: 'guard',
    range: 12,
    approach: false,
    los: true,
    duration: 0.6,
    cooldown: 3,
    item: 'harpoon-bolt',
    suspicious: true,
    check: (_w, _op, t) => (t.kind === 'guard' && t.guard.status === 'active' ? OK : reject('invalid-target', 'Choose an active enemy')),
    apply: (w, op, t) => {
      if (t.kind !== 'guard' || t.guard.status !== 'active') return;
      w.noise(op.pos, NOISE_DB.harpoon, 'harpoon', op.id);
      if (rangedShot(w, op, t.guard, 'harpoon', 0.92, 12)) kill(w, op, t.guard, 0);
      else alertShotTarget(w, op, t.guard);
    },
  },
  disguise: {
    id: 'disguise',
    target: 'self',
    range: 0,
    approach: false,
    los: false,
    duration: 3,
    cooldown: 0,
    item: 'uniform',
    check: (w, op) => {
      if (op.disguised) return reject('condition', 'Already in uniform');
      return w.isObserved(op) ? reject('condition', 'Someone is watching. Change out of sight') : OK;
    },
    apply: (w, op) => {
      op.disguised = true;
      w.log('info', 'Now disguised as an Iron Dominion officer');
    },
  },
  'take-uniform': {
    id: 'take-uniform',
    target: 'body',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 3,
    cooldown: 0,
    suspicious: true,
    check: (_w, _op, t) => (t.kind === 'guard' && t.guard.rank === 'officer' ? OK : reject('invalid-target', 'Only an officer\'s uniform will pass inspection')),
    apply: (w, op, t) => {
      if (t.kind !== 'guard') return;
      t.guard.rank = 'soldier'; // one uniform per body
      op.inventory.uniform = (op.inventory.uniform ?? 0) + 1;
      w.log('success', 'Officer uniform taken');
    },
  },
  converse: {
    id: 'converse',
    target: 'guard',
    range: 2,
    approach: true,
    los: false,
    duration: 0,
    cooldown: 0,
    check: (_w, op, t) => {
      if (!op.disguised) return reject('condition', 'Needs a disguise');
      if (t.kind !== 'guard' || t.guard.status !== 'active') return reject('invalid-target', 'Choose an enemy soldier');
      const busy = ['alerted', 'combat', 'challenge', 'investigate', 'search', 'escort'].includes(t.guard.state);
      return busy ? reject('condition', 'He is too busy to chat') : OK;
    },
    apply: (w, op, t) => {
      if (t.kind !== 'guard') return;
      w.distractGuard(t.guard, op);
      op.action = { kind: 'converse', guardId: t.guard.id };
    },
  },
  chat: {
    id: 'chat',
    target: 'guard',
    range: 2,
    approach: true,
    los: false,
    duration: 0,
    cooldown: 0,
    check: (w, op, t) => {
      if (!spyCoverIntact(w, op)) return reject('condition', 'His cover is blown');
      if (t.kind !== 'guard' || t.guard.status !== 'active') return reject('invalid-target', 'Choose an enemy soldier');
      const busy = ['alerted', 'combat', 'challenge', 'investigate', 'search', 'escort'].includes(t.guard.state);
      return busy ? reject('condition', 'He is too busy to chat') : OK;
    },
    // He stops scanning and watches only the spy for 10 seconds.
    apply: (w, op, t) => {
      if (t.kind !== 'guard') return;
      w.distractGuard(t.guard, op, SPY_CHAT_SECONDS);
      op.action = { kind: 'converse', guardId: t.guard.id };
    },
  },
  revive: {
    id: 'revive',
    target: 'ally',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 4,
    cooldown: 0,
    item: 'medkit',
    check: (_w, _op, t) => (t.kind === 'ally' && t.op.status === 'downed' ? OK : reject('invalid-target', 'Choose a downed squad member')),
    apply: (w, _op, t) => t.kind === 'ally' && w.reviveOperative(t.op, 60),
  },
  'first-aid': {
    id: 'first-aid',
    target: 'ally',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 7,
    cooldown: 0,
    item: 'dressing',
    check: (_w, _op, t) => (t.kind === 'ally' && t.op.status === 'downed' ? OK : reject('invalid-target', 'Choose a downed squad member')),
    apply: (w, _op, t) => t.kind === 'ally' && w.reviveOperative(t.op, 30),
  },
  resupply: {
    id: 'resupply',
    target: 'ally',
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 2,
    cooldown: 0,
    check: (_w, op, t) => {
      if (t.kind !== 'ally' || t.op.status !== 'active') return reject('invalid-target', 'Choose a squad member on their feet');
      return Object.keys(resupplyLoad(op, t.op)).length > 0 ? OK : reject('condition', 'Nothing to hand over that they can fire');
    },
    apply: (w, op, t) => {
      if (t.kind !== 'ally' || t.op.status !== 'active') return;
      const handed: string[] = [];
      for (const [item, count] of Object.entries(resupplyLoad(op, t.op)) as [ItemId, number][]) {
        op.inventory[item] = (op.inventory[item] ?? 0) - count;
        t.op.inventory[item] = (t.op.inventory[item] ?? 0) + count;
        const [one, many] = AMMO_NAMES[item] ?? [item, item];
        handed.push(`${count} ${count === 1 ? one : many}`);
      }
      if (handed.length > 0) w.log('success', `Resupplied ${t.op.role}: ${handed.join(', ')}`);
    },
  },
  smoke: {
    id: 'smoke',
    target: 'point',
    range: 15,
    approach: false,
    los: false,
    duration: 0.6,
    cooldown: 2,
    item: 'smoke',
    apply: (w, op, t) => {
      w.state.smoke.push({ id: w.newId('smoke'), pos: { ...t.pos }, radius: 4, height: 3, until: w.state.tick + seconds(20) });
      w.noise(t.pos, 55, 'impact', op.id);
    },
  },
  dive: {
    id: 'dive',
    target: 'self',
    range: 0,
    approach: false,
    los: false,
    duration: 0.3,
    cooldown: 0,
    check: (w, op) => (w.grid.hasFlag(w.grid.cellAt(op.pos), CellFlag.Deep) ? OK : reject('condition', 'Needs deep water')),
    apply: (_w, op) => {
      op.submerged = !op.submerged;
    },
  },
  free: {
    id: 'free',
    target: 'object',
    objectTypes: ['prisoner'],
    range: MELEE_RANGE,
    approach: true,
    los: false,
    duration: 2,
    cooldown: 0,
    check: (_w, _op, t) => (t.kind === 'object' && t.obj.type === 'prisoner' && !t.obj.freed && t.obj.alive ? OK : reject('invalid-target', 'Nobody to free')),
    apply: (w, op, t) => {
      if (t.kind === 'ally' && t.op.status === 'captured') {
        t.op.status = 'active';
        t.op.escortedBy = null;
        w.emit({ type: 'operative-status', unitId: t.op.id, status: 'active' });
        w.log('success', `${t.op.role} has been freed`);
        return;
      }
      if (t.kind !== 'object' || t.obj.type !== 'prisoner') return;
      t.obj.freed = true;
      t.obj.following = op.id;
      w.log('success', 'Prisoner freed. He will follow you');
    },
  },
};

/** Resolves a command target against the current state. Captured squad members are freed with `free` too. */
export function resolveTarget(world: World, op: Operative, def: AbilityDef, target: AbilityTarget): ResolvedTarget | null {
  switch (def.target) {
    case 'self':
      return { kind: 'self', pos: op.pos };
    case 'point':
      return target.kind === 'point' ? { kind: 'point', pos: target.pos } : target.kind === 'entity' ? entityPos(world, target.id) : null;
    case 'guard': {
      const g = target.kind === 'entity' ? world.guard(target.id) : undefined;
      return g && g.carriedBy === null && g.hiddenIn === null ? { kind: 'guard', guard: g, pos: g.pos } : null;
    }
    case 'body': {
      const g = target.kind === 'entity' ? world.guard(target.id) : undefined;
      return g && isBody(g) ? { kind: 'guard', guard: g, pos: g.pos } : null;
    }
    case 'ally': {
      const ally = target.kind === 'entity' ? world.operative(target.id) : undefined;
      return ally && ally.id !== op.id ? { kind: 'ally', op: ally, pos: ally.pos } : null;
    }
    case 'object': {
      if (target.kind !== 'entity') return null;
      const obj = world.object(target.id);
      if (obj?.type === 'fence' && def.objectTypes?.includes('fence')) return { kind: 'object', obj, pos: world.fenceCellNear(obj, target.at ?? op.pos) };
      if (obj && def.objectTypes?.includes(obj.type)) return { kind: 'object', obj, pos: obj.pos };
      // Freeing a captured squad member uses the same order.
      if (def.id === 'free') {
        const ally = world.operative(target.id);
        if (ally && ally.status === 'captured') return { kind: 'ally', op: ally, pos: ally.pos };
      }
      return null;
    }
  }
}

function entityPos(world: World, id: string): ResolvedTarget | null {
  const obj = world.object(id);
  if (obj) return { kind: 'object', obj, pos: obj.pos };
  const g = world.guard(id);
  if (g) return { kind: 'guard', guard: g, pos: g.pos };
  return null;
}

export function hasLineOfSightTo(world: World, op: Operative, pos: Vec2): boolean {
  const eye = world.grid.heightAt(op.pos) + (op.stance === 'prone' ? 0.4 : op.stance === 'crouch' ? 1.0 : 1.6);
  return traceSight(world.sight, op.pos, eye, pos, world.grid.heightAt(pos) + TARGET_HEIGHT.crouch).clear;
}

/** Static checks shared by enqueue-time and tick-time validation. Does not check range. */
export function validateAbility(world: World, op: Operative, abilityId: AbilityId, target: AbilityTarget): { result: CommandResult; resolved: ResolvedTarget | null } {
  const def = ABILITIES[abilityId];
  const fail = (r: CommandResult) => ({ result: r, resolved: null });
  if (op.status !== 'active') return fail(reject('unit-unavailable', 'Unavailable'));
  if (!SPECIALIST_RULES[op.role].abilities.includes(abilityId)) return fail(reject('not-your-ability', 'Not this specialist\'s skill'));
  if (def.item && (op.inventory[def.item] ?? 0) <= 0) return fail(reject('no-item', `Out of ${def.item}`));
  if ((op.cooldowns[abilityId] ?? 0) > 0) return fail(reject('cooldown', 'Not ready yet'));
  if (op.carrying && !def.allowCarrying && abilityId !== 'drop') return fail(reject('busy', 'Put the body down first'));
  if (op.submerged && abilityId !== 'dive') return fail(reject('condition', 'Surface first'));
  const resolved = resolveTarget(world, op, def, target);
  if (!resolved) return fail(reject('invalid-target', 'Invalid target'));
  if (resolved.kind === 'point' && world.grid.cellAt(resolved.pos) < 0) return fail(reject('invalid-target', 'Outside the area of operations'));
  // `free` on a captured ally has its own rule.
  if (abilityId === 'free' && resolved.kind === 'ally') {
    return { result: resolved.op.status === 'captured' ? OK : reject('invalid-target', 'Nobody to free'), resolved };
  }
  const specific = def.check?.(world, op, resolved) ?? OK;
  return { result: specific, resolved: specific.ok ? resolved : null };
}

/** Range and sight checks for executing now (not approaching). */
export function readyToExecute(world: World, op: Operative, def: AbilityDef, resolved: ResolvedTarget): CommandResult {
  if (resolved.kind !== 'self' && def.range !== Infinity && distance(op.pos, resolved.pos) > def.range + 0.05) {
    return reject('out-of-range', 'Out of range');
  }
  if (def.los && !hasLineOfSightTo(world, op, resolved.pos)) return reject('no-line-of-sight', 'No line of sight');
  return OK;
}

export function difficultyRules(world: World) {
  return DIFFICULTY[world.state.difficulty];
}
