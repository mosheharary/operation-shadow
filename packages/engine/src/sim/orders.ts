import { distance, headingTo, type Vec2 } from '../core/math';
import { CellFlag } from '../level/types';
import type { NavProfile } from '../nav/pathfinder';
import { ABILITIES, readyToExecute, validateAbility, type AbilityDef, type ResolvedTarget } from './abilities';
import { OK, reject, type Command, type CommandResult } from './commands';
import { SPECIALIST_RULES } from './rules';
import { type AbilityTarget, type Action, type Gait, type Operative, seconds } from './types';
import type { World } from './world';

const FORMATION: readonly Vec2[] = [
  { x: 0, z: 0 },
  { x: 1.3, z: 0 },
  { x: -1.3, z: 0 },
  { x: 0, z: 1.3 },
  { x: 0, z: -1.3 },
  { x: 1.3, z: 1.3 },
];

export function navProfileFor(op: Operative): NavProfile {
  return SPECIALIST_RULES[op.role].nav;
}

function activeUnit(world: World, id: string): Operative | CommandResult {
  const op = world.operative(id);
  if (!op) return reject('unknown-unit', 'Unknown squad member');
  if (op.status !== 'active') return reject('unit-unavailable', `${id} cannot act right now`);
  return op;
}

function formationTargets(world: World, units: Operative[], target: Vec2): Vec2[] {
  if (units.length === 1) return [target];
  return units.map((op, i) => {
    const offset = FORMATION[i % FORMATION.length]!;
    const p = { x: target.x + offset.x, z: target.z + offset.z };
    const cell = world.pathfinder.nearestPassable(p, navProfileFor(op), 2);
    return cell >= 0 ? world.grid.center(cell) : target;
  });
}

export function validateCommand(world: World, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'move': {
      if (world.grid.cellAt(cmd.target) < 0) return reject('invalid-target', 'Outside the area of operations');
      const units: Operative[] = [];
      for (const id of cmd.unitIds) {
        const u = activeUnit(world, id);
        if ('ok' in u) return u;
        units.push(u);
      }
      if (units.length === 0) return reject('unknown-unit', 'Select a squad member');
      if (cmd.queue) return OK;
      const targets = formationTargets(world, units, cmd.target);
      const reachable = units.filter((op, i) => world.pathfinder.findPath(op.pos, targets[i]!, navProfileFor(op)).ok);
      if (reachable.length === 0) {
        const deep = world.grid.hasFlag(world.grid.cellAt(cmd.target), CellFlag.Deep);
        return reject('unreachable', deep ? 'Only the Marine Operator can swim' : 'Cannot reach that spot');
      }
      return OK;
    }
    case 'stance': {
      for (const id of cmd.unitIds) {
        const u = activeUnit(world, id);
        if ('ok' in u) return u;
        if (cmd.stance === 'prone' && u.carrying) return reject('condition', 'Cannot crawl while carrying a body');
      }
      return OK;
    }
    case 'stop':
      return OK;
    case 'ability': {
      const u = activeUnit(world, cmd.unitId);
      if ('ok' in u) return u;
      const { result, resolved } = validateAbility(world, u, cmd.abilityId, cmd.target);
      if (!result.ok || !resolved) return result;
      const def = ABILITIES[cmd.abilityId];
      if (cmd.queue) return OK;
      const ready = readyToExecute(world, u, def, resolved);
      if (ready.ok) return OK;
      if (!def.approach) return ready;
      return world.pathfinder.findPath(u.pos, resolved.pos, navProfileFor(u)).ok ? OK : reject('unreachable', 'Cannot reach the target');
    }
  }
}

export function applyCommand(world: World, cmd: Command): void {
  const result = validateCommand(world, cmd);
  if (!result.ok) {
    const unitId = cmd.type === 'ability' ? cmd.unitId : (cmd.unitIds[0] ?? '');
    world.emit({ type: 'rejected', unitId, reason: result.message });
    return;
  }
  switch (cmd.type) {
    case 'move': {
      const units = cmd.unitIds.map((id) => world.operative(id)!);
      const targets = formationTargets(world, units, cmd.target);
      units.forEach((op, i) => {
        const gait: Gait = op.carrying ? 'walk' : cmd.gait;
        const action: Action = { kind: 'move', path: [], index: 0, gait, target: targets[i]!, linkProgress: 0 };
        if (cmd.queue && (op.action || op.queue.length > 0)) op.queue.push(action);
        else {
          interrupt(world, op);
          op.queue = [];
          op.action = action;
        }
      });
      if (units[0]) world.emit({ type: 'bark', speaker: units[0].id, line: 'ack-move', priority: 1 });
      return;
    }
    case 'stance':
      for (const id of cmd.unitIds) {
        const op = world.operative(id)!;
        op.stance = cmd.stance;
      }
      return;
    case 'stop':
      for (const id of cmd.unitIds) {
        const op = world.operative(id);
        if (!op) continue;
        interrupt(world, op);
        op.action = null;
        op.queue = [];
      }
      return;
    case 'ability': {
      const op = world.operative(cmd.unitId)!;
      const action: Action = {
        kind: 'approach',
        abilityId: cmd.abilityId,
        target: cmd.target,
        path: [],
        index: 0,
        gait: op.carrying ? 'walk' : (cmd.gait ?? 'walk'),
        repathTick: 0,
        linkProgress: 0,
      };
      if (cmd.queue && (op.action || op.queue.length > 0)) {
        op.queue.push(action);
        return;
      }
      interrupt(world, op);
      op.queue = [];
      op.action = action;
      world.emit({ type: 'bark', speaker: op.id, line: 'ack-action', priority: 1 });
      // Execute immediately if already in range.
      tryBegin(world, op, action);
      return;
    }
  }
}

/** Cancels the current action, emitting an interruption for channels and ending conversations. */
export function interrupt(world: World, op: Operative): void {
  const action = op.action;
  if (!action) return;
  if (action.kind === 'channel' && !action.applied && action.remaining > 0) {
    world.emit({ type: 'ability', unitId: op.id, abilityId: action.abilityId, phase: 'interrupted' });
  }
  if (action.kind === 'converse') world.endDistraction(action.guardId);
}

/** Starts the ability now if the operative is in range; returns true when it began. */
export function tryBegin(world: World, op: Operative, action: Extract<Action, { kind: 'approach' }>): boolean {
  const def = ABILITIES[action.abilityId];
  const { result, resolved } = validateAbility(world, op, action.abilityId, action.target);
  if (!result.ok || !resolved) {
    world.emit({ type: 'rejected', unitId: op.id, reason: result.ok ? 'Invalid target' : result.message });
    op.action = null;
    return true;
  }
  if (!readyToExecute(world, op, def, resolved).ok) return false;
  beginChannel(world, op, def, resolved, action.target);
  return true;
}

function consume(world: World, op: Operative, def: AbilityDef): void {
  if (def.item && def.consume !== false) {
    op.inventory[def.item] = Math.max(0, (op.inventory[def.item] ?? 0) - 1);
    world.state.stats.itemsUsed[def.item] = (world.state.stats.itemsUsed[def.item] ?? 0) + 1;
  }
  if (def.cooldown > 0) op.cooldowns[def.id] = seconds(def.cooldown);
}

export function beginChannel(world: World, op: Operative, def: AbilityDef, resolved: ResolvedTarget, target: AbilityTarget): void {
  if (def.stance && op.stance !== def.stance) op.stance = def.stance;
  if (resolved.kind !== 'self' && distance(op.pos, resolved.pos) > 0.01) op.facing = headingTo(op.pos, resolved.pos);
  // Hostile acts are remembered briefly: they blow a disguise and rule out a peaceful "halt".
  if (def.suspicious) op.suspiciousUntil = world.state.tick + seconds(5);
  const targetId = target.kind === 'entity' ? target.id : undefined;
  world.emit({ type: 'ability', unitId: op.id, abilityId: def.id, phase: 'start', ...(targetId ? { targetId } : {}) });

  op.action = null;
  if (def.duration <= 0) {
    consume(world, op, def);
    def.apply(world, op, resolved);
    world.emit({ type: 'ability', unitId: op.id, abilityId: def.id, phase: 'complete', ...(targetId ? { targetId } : {}) });
    return;
  }
  const total = seconds(def.duration);
  if (def.instant) {
    consume(world, op, def);
    def.apply(world, op, resolved);
  }
  op.action = { kind: 'channel', abilityId: def.id, target, remaining: total, total, anchor: { ...op.pos }, applied: Boolean(def.instant) };
}

export function completeChannel(world: World, op: Operative, action: Extract<Action, { kind: 'channel' }>): void {
  const def = ABILITIES[action.abilityId];
  const targetId = action.target.kind === 'entity' ? action.target.id : undefined;
  if (!action.applied) {
    const { result, resolved } = validateAbility(world, op, action.abilityId, action.target);
    if (!result.ok || !resolved || (resolved.kind !== 'self' && def.range !== Infinity && distance(op.pos, resolved.pos) > def.range * 1.5 + 0.1)) {
      world.emit({ type: 'ability', unitId: op.id, abilityId: def.id, phase: 'interrupted', ...(targetId ? { targetId } : {}) });
      return;
    }
    consume(world, op, def);
    def.apply(world, op, resolved);
  }
  world.emit({ type: 'ability', unitId: op.id, abilityId: def.id, phase: 'complete', ...(targetId ? { targetId } : {}) });
}
