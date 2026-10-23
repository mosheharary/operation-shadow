import { distance, headingTo, moveToward, type Vec2 } from '../core/math';
import { CellFlag, Surface } from '../level/types';
import { ABILITIES } from './abilities';
import { followPath } from './movement';
import { completeChannel, interrupt, navProfileFor, tryBegin } from './orders';
import { DIFFICULTY, operativeSpeed, SPECIALIST_RULES } from './rules';
import { DT, type Gait, type Operative, type Stance, seconds } from './types';
import type { World } from './world';

/** Footstep sound level (dB at 1 m) when walking upright on each surface. */
const FOOTSTEP_WALK_DB: Record<number, number> = {
  [Surface.Grass]: 40,
  [Surface.Dirt]: 42,
  [Surface.Gravel]: 50,
  [Surface.Sand]: 38,
  [Surface.Snow]: 38,
  [Surface.Mud]: 44,
  [Surface.Stone]: 46,
  [Surface.Concrete]: 46,
  [Surface.Wood]: 50,
  [Surface.Metal]: 56,
  [Surface.ShallowWater]: 54,
  [Surface.DeepWater]: 34,
  [Surface.Rock]: 46,
};

/** A run to a strike from behind drops to a crouched walk this close to the target, below most sentries' hearing. */
const CREEP_DISTANCE = 6;

const SURFACE_SPEED: Partial<Record<Surface, number>> = {
  [Surface.Sand]: 0.9,
  [Surface.Snow]: 0.82,
  [Surface.Mud]: 0.75,
  [Surface.ShallowWater]: 0.6,
};

export function footstepDb(surface: Surface, stance: Stance, gait: Gait): number {
  let db = FOOTSTEP_WALK_DB[surface] ?? 42;
  if (gait === 'run' && stance !== 'prone') db += 12;
  if (stance === 'crouch') db -= gait === 'run' ? 6 : 10;
  if (stance === 'prone') db -= 20;
  return Math.max(15, db);
}

const MAX_FOOTPRINTS = 600;

export function isSwimming(world: World, op: Operative): boolean {
  return world.grid.hasFlag(world.grid.cellAt(op.pos), CellFlag.Deep);
}

function moveSpeed(world: World, op: Operative, gait: Gait): number {
  const cell = world.grid.cellAt(op.pos);
  const swimming = world.grid.hasFlag(cell, CellFlag.Deep);
  const effectiveGait: Gait = op.carrying ? 'walk' : gait;
  let speed = operativeSpeed(swimming ? 'stand' : op.stance, effectiveGait, swimming);
  if (!swimming) speed *= SURFACE_SPEED[world.level.surface[cell] as Surface] ?? 1;
  if (op.carrying) speed *= SPECIALIST_RULES[op.role].strong ? 0.6 : 0.35;
  return speed;
}

function afterMove(world: World, op: Operative, moved: number, gait: Gait): void {
  if (moved <= 0) return;
  const s = world.state;
  op.lastMoveTick = s.tick;
  op.lastGait = op.carrying ? 'walk' : gait;
  s.stats.distance += moved;
  op.stride += moved;
  const strideLength = op.stance === 'prone' ? 0.6 : op.lastGait === 'run' ? 1.1 : 0.75;
  while (op.stride >= strideLength) {
    op.stride -= strideLength;
    const cell = world.grid.cellAt(op.pos);
    if (cell < 0) break;
    const surface = world.level.surface[cell] as Surface;
    const swimming = world.grid.hasFlag(cell, CellFlag.Deep);
    if (op.submerged) continue;
    const db = swimming ? 34 : footstepDb(surface, op.stance, op.lastGait);
    world.noise(op.pos, db, 'footstep', op.id);
    world.emit({ type: 'footstep', unitId: op.id, pos: { ...op.pos }, surface, db });
    if (!swimming && op.stance !== 'prone' && world.grid.hasFlag(cell, CellFlag.Prints)) {
      s.footprints.push({ pos: { ...op.pos }, heading: op.facing, tick: s.tick, ownerId: op.id });
      if (s.footprints.length > MAX_FOOTPRINTS) s.footprints.splice(0, s.footprints.length - MAX_FOOTPRINTS);
    }
  }
}

/** Planning mode: drops the plan when its abort condition has occurred since it was armed. */
function checkAbort(world: World, op: Operative): void {
  const rule = op.abortRule;
  if (!rule || (!op.action && op.queue.length === 0)) return;
  const s = world.state;
  const spotted = rule.on === 'spotted' && (op.lastSpottedTick ?? -1) > rule.since;
  const alarmed = rule.on === 'alarm' && s.alarm.level > rule.alarmAt;
  if (!spotted && !alarmed) return;
  interrupt(world, op);
  op.action = null;
  op.queue = [];
  op.abortRule = { on: rule.on, since: s.tick, alarmAt: s.alarm.level };
  world.log('warning', `${op.role} aborted the plan: ${spotted ? 'spotted' : 'the alarm went up'}`);
  world.emit({ type: 'rejected', unitId: op.id, reason: spotted ? 'Plan aborted: spotted' : 'Plan aborted: alarm' });
}

function processAction(world: World, op: Operative): void {
  checkAbort(world, op);
  if (!op.action) {
    const next = op.queue.shift();
    if (!next) return;
    op.action = next;
  }
  const action = op.action;
  switch (action.kind) {
    case 'move': {
      if (action.path.length === 0) {
        const res = world.pathfinder.findPath(op.pos, action.target, navProfileFor(op));
        if (!res.ok) {
          world.emit({ type: 'rejected', unitId: op.id, reason: 'Cannot reach that spot' });
          op.action = null;
          return;
        }
        action.path = res.points;
        action.index = 1;
      }
      const progress = followPath(world, op, action.path, action.index, action.linkProgress, moveSpeed(world, op, action.gait), op.id);
      action.index = progress.index;
      action.linkProgress = progress.linkProgress;
      afterMove(world, op, progress.moved, action.gait);
      if (progress.arrived) op.action = null;
      return;
    }
    case 'approach': {
      if (tryBegin(world, op, action)) return;
      const s = world.state;
      // A run to a strike from behind (knife, knockout) sprints the distance and creeps the last metres.
      if (action.gait === 'run' && ABILITIES[action.abilityId].stance === 'crouch') {
        const target = world.resolveTargetPos(action.target, op.pos);
        if (target && distance(op.pos, target) < CREEP_DISTANCE) {
          action.gait = 'walk';
          op.stance = 'crouch';
        }
      }
      // Re-plan toward a moving target, but never in the middle of a climb or ladder.
      const midLink = action.linkProgress > 0;
      if (action.path.length === 0 || action.index >= action.path.length || (s.tick >= action.repathTick && !midLink)) {
        const target = world.resolveTargetPos(action.target, op.pos);
        const res = target ? world.pathfinder.findPath(op.pos, target, navProfileFor(op)) : null;
        if (!res || !res.ok) {
          world.emit({ type: 'rejected', unitId: op.id, reason: 'Cannot reach the target' });
          op.action = null;
          return;
        }
        action.path = res.points;
        action.index = 1;
        action.linkProgress = 0;
        action.repathTick = s.tick + 10;
      }
      const progress = followPath(world, op, action.path, action.index, action.linkProgress, moveSpeed(world, op, action.gait), op.id);
      action.index = progress.index;
      action.linkProgress = progress.linkProgress;
      afterMove(world, op, progress.moved, action.gait);
      tryBegin(world, op, action);
      return;
    }
    case 'channel': {
      action.remaining -= 1;
      if (action.remaining <= 0) {
        op.action = null;
        completeChannel(world, op, action);
      }
      return;
    }
    case 'converse': {
      const guard = world.guard(action.guardId);
      if (!guard || guard.status !== 'active' || guard.distractedBy !== op.id) op.action = null;
      return;
    }
    case 'wait-signal':
      return;
  }
}

function updatePrisoners(world: World): void {
  for (const obj of world.state.objects) {
    if (obj.type !== 'prisoner' || !obj.freed || obj.extracted || !obj.alive || !obj.following) continue;
    const leader = world.operative(obj.following);
    if (!leader || leader.status !== 'active') continue;
    const gap = distance(obj.pos, leader.pos);
    if (gap <= 1.8) continue;
    const step = 2.4 * DT;
    if (world.pathfinder.straightWalkable(obj.pos, leader.pos, { swim: false, climb: false })) {
      obj.pos = moveToward(obj.pos, leader.pos, step).pos;
    } else {
      const path = world.prisonerPath(obj.id, obj.pos, leader.pos);
      if (path) obj.pos = moveToward(obj.pos, path, step).pos;
    }
  }
}

function carriedOffset(op: Operative): Vec2 {
  return { x: op.pos.x - Math.cos(op.facing) * 0.35, z: op.pos.z - Math.sin(op.facing) * 0.35 };
}

export function updateOperatives(world: World): void {
  const s = world.state;
  for (const op of s.operatives) {
    if (op.status === 'downed') {
      if (op.bleedOut > 0) {
        op.bleedOut -= 1;
        if (op.bleedOut === 0) world.killOperative(op, 'bled out');
      }
      continue;
    }
    if (op.status !== 'active') continue;
    for (const key of Object.keys(op.cooldowns) as (keyof typeof op.cooldowns)[]) {
      const left = (op.cooldowns[key] ?? 0) - 1;
      if (left <= 0) delete op.cooldowns[key];
      else op.cooldowns[key] = left;
    }
    processAction(world, op);
    if (op.carrying) {
      const body = world.guard(op.carrying);
      if (body) body.pos = carriedOffset(op);
    }
    if (op.submerged && !isSwimming(world, op)) op.submerged = false;
    if (op.stance === 'prone' && isSwimming(world, op)) op.stance = 'stand';
  }
  updatePrisoners(world);
}

/** Damage to an operative from enemy fire or explosions. */
export function damageOperative(world: World, op: Operative, amount: number, cause: string): void {
  if (op.status !== 'active' && op.status !== 'captured') return;
  const rules = DIFFICULTY[world.state.difficulty];
  op.health -= amount;
  world.state.stats.injuries += 1;
  world.emit({ type: 'damage', targetId: op.id, amount });
  if (op.health > 0) return;
  op.health = 0;
  if (rules.bleedOutSeconds > 0) {
    op.status = 'downed';
    op.bleedOut = seconds(rules.bleedOutSeconds);
    op.action = null;
    op.queue = [];
    if (op.carrying) world.dropCarried(op);
    world.state.stats.downs += 1;
    world.emit({ type: 'operative-status', unitId: op.id, status: 'downed' });
    world.emit({ type: 'bark', speaker: op.id, line: 'downed', priority: 3 });
    world.log('danger', `${op.role} is down (${cause}). Revive within ${rules.bleedOutSeconds} s`);
  } else {
    world.killOperative(op, cause);
  }
}

export function faceToward(op: Operative, pos: Vec2): void {
  op.facing = headingTo(op.pos, pos);
}
