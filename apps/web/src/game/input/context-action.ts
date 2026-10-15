import { ABILITY_INFO } from '@operation-shadow/content';
import {
  ABILITIES,
  type AbilityId,
  type AbilityTarget,
  type Command,
  type CommandResult,
  type Gait,
  type Operative,
  SPECIALIST_RULES,
  type Vec2,
  type World,
} from '@operation-shadow/engine';

export type PointerTarget = { kind: 'operative' | 'guard' | 'object'; id: string } | null;

/** What a right-click would do right now. Built and validated without touching the simulation. */
export type ContextAction =
  | { kind: 'move'; command: Extract<Command, { type: 'move' }>; label: string }
  | { kind: 'ability'; command: Extract<Command, { type: 'ability' }>; label: string }
  | { kind: 'blocked'; label: string; message: string }
  | { kind: 'none' };

export interface ContextOptions {
  gait?: Gait;
  queue?: boolean;
}

/** Message when nobody selected has the skill an object needs. */
const NEEDS_SPECIALIST: Partial<Record<AbilityId, string>> = {
  lockpick: 'Locked. Only the Combat Engineer can pick it',
  'cut-fence': 'Only the Combat Engineer can cut the wire',
  sabotage: 'Only the Combat Engineer can sabotage this',
  revive: 'Needs a medkit or a field dressing',
  'first-aid': 'Needs a medkit or a field dressing',
};

function activeUnits(world: World, ids: string[]): Operative[] {
  return ids.map((id) => world.operative(id)).filter((op): op is Operative => op?.status === 'active');
}

function moveAction(world: World, units: Operative[], target: Vec2, options: ContextOptions): ContextAction {
  if (units.length === 0) return { kind: 'none' };
  const command: Extract<Command, { type: 'move' }> = { type: 'move', unitIds: units.map((u) => u.id), target, gait: options.gait ?? 'walk', queue: options.queue };
  const result = world.validate(command);
  if (!result.ok) return { kind: 'blocked', label: 'Move', message: result.message };
  return { kind: 'move', command, label: options.gait === 'run' ? 'Run here' : 'Move here' };
}

/** Abilities to try, in order, for a unit and a hovered entity. Never includes a lethal ability. */
function candidates(world: World, op: Operative, target: NonNullable<PointerTarget>): AbilityId[] {
  if (target.kind === 'guard') {
    const g = world.guard(target.id);
    if (!g || g.carriedBy || g.hiddenIn) return [];
    if (g.status === 'active') {
      switch (op.role) {
        case 'infiltrator':
          return ['takedown'];
        case 'medic':
          return ['chloroform'];
        case 'recon':
          return ['dart', 'binoculars'];
        case 'deception':
          if (op.disguised && g.distractedBy !== op.id) return ['converse', 'sedative'];
          return ['sedative'];
        default:
          return [];
      }
    }
    if (op.carrying) return [];
    const list: AbilityId[] = [];
    if (op.role === 'deception' && g.rank === 'officer' && !op.disguised && (op.inventory.uniform ?? 0) === 0) list.push('take-uniform');
    if (g.status === 'ko') list.push('restrain');
    list.push('carry');
    return list;
  }
  if (target.kind === 'operative') {
    const ally = world.operative(target.id);
    if (!ally || ally.id === op.id) return [];
    if (ally.status === 'downed') return ['revive', 'first-aid'];
    if (ally.status === 'captured') return ['free'];
    return [];
  }
  const obj = world.object(target.id);
  if (!obj) return [];
  switch (obj.type) {
    case 'door':
      return obj.locked ? ['lockpick'] : ['door'];
    case 'fence':
      return obj.cutCells.length === 0 ? ['cut-fence'] : [];
    case 'item':
      return obj.takenBy ? [] : ['pick-up'];
    case 'device': {
      if (obj.owner !== op.id) return [];
      const near = Math.hypot(obj.pos.x - op.pos.x, obj.pos.z - op.pos.z) < 2;
      return near ? ['pick-up'] : ['trigger-device'];
    }
    case 'container':
      return op.carrying ? ['hide-body'] : [];
    case 'alarm-bell':
    case 'radio':
    case 'searchlight':
    case 'objective-target':
      return obj.sabotaged || obj.destroyed ? [] : ['sabotage'];
    case 'prisoner':
      return obj.freed || !obj.alive ? [] : ['free'];
    default:
      return [];
  }
}

function abilityLabel(abilityId: AbilityId, world: World, target: NonNullable<PointerTarget>): string {
  if (abilityId === 'door') {
    const door = world.object(target.id);
    return door?.type === 'door' && door.open ? 'Close door' : 'Open door';
  }
  return ABILITY_INFO[abilityId].name;
}

export function abilityTargetFor(abilityId: AbilityId, hover: PointerTarget, ground: Vec2 | null): AbilityTarget | null {
  const def = ABILITIES[abilityId];
  if (def.target === 'self') return { kind: 'self' };
  if (def.target === 'point') {
    if (hover && hover.kind !== 'operative') return { kind: 'entity', id: hover.id };
    return ground ? { kind: 'point', pos: ground } : null;
  }
  return hover ? { kind: 'entity', id: hover.id } : null;
}

/**
 * Resolves the right-click action for the current selection. Entity targets go to the first
 * selected squad member able to act on them; empty ground moves everyone selected.
 */
export function resolveContextAction(world: World, selected: string[], hover: PointerTarget, ground: Vec2 | null, options: ContextOptions = {}): ContextAction {
  const units = activeUnits(world, selected);
  if (units.length === 0) return { kind: 'none' };
  if (!hover) return ground ? moveAction(world, units, ground, options) : { kind: 'none' };
  if (hover.kind === 'operative' && units.length === 1 && units[0]!.id === hover.id) return { kind: 'none' };

  // Weak failures (missing skill, empty pouch) give way to a real reason from a later candidate.
  let failure: { label: string; message: string; weak: boolean } | null = null;
  const note = (label: string, message: string, weak: boolean) => {
    if (!failure || (failure.weak && !weak)) failure = { label, message, weak };
  };
  let anyCandidate = false;
  for (const op of units) {
    for (const abilityId of candidates(world, op, hover)) {
      anyCandidate = true;
      if (!SPECIALIST_RULES[op.role].abilities.includes(abilityId)) {
        note(ABILITY_INFO[abilityId].name, NEEDS_SPECIALIST[abilityId] ?? 'Nobody selected can do that', true);
        continue;
      }
      const command: Extract<Command, { type: 'ability' }> = {
        type: 'ability',
        unitId: op.id,
        abilityId,
        target: { kind: 'entity', id: hover.id },
        queue: options.queue,
        gait: options.gait,
      };
      const result: CommandResult = world.validate(command);
      const label = abilityLabel(abilityId, world, hover);
      if (result.ok) return { kind: 'ability', command, label };
      note(label, result.message, result.reason === 'no-item');
    }
  }

  const found = failure as { label: string; message: string; weak: boolean } | null;
  if (found) return { kind: 'blocked', label: found.label, message: found.message };
  if (hover.kind === 'guard') {
    const g = world.guard(hover.id);
    if (g?.status === 'active') {
      return { kind: 'blocked', label: 'No silent takedown', message: 'Nobody selected has a non-lethal takedown. Pick an ability from the bar' };
    }
    return { kind: 'none' };
  }
  if (!anyCandidate) {
    // Nothing to do with it: walk over instead (allies, crates, freed prisoners and the like).
    const target = ground ?? world.operative(hover.id)?.pos ?? world.object(hover.id)?.pos;
    if (target) return moveAction(world, units, target, options);
  }
  return { kind: 'none' };
}

/** Builds and validates an explicit ability order from the targeting cursor. */
export function resolveAbilityOrder(
  world: World,
  unitId: string,
  abilityId: AbilityId,
  hover: PointerTarget,
  ground: Vec2 | null,
  options: ContextOptions = {},
): { command: Extract<Command, { type: 'ability' }> | null; result: CommandResult } {
  const target = abilityTargetFor(abilityId, hover, ground);
  if (!target) return { command: null, result: { ok: false, reason: 'invalid-target', message: 'Choose a target' } };
  const command: Extract<Command, { type: 'ability' }> = { type: 'ability', unitId, abilityId, target, queue: options.queue, gait: options.gait };
  return { command, result: world.validate(command) };
}

/** Ability bar contents for a specialist: role skills first, then shared tools. Carry and drop share a slot. */
export function abilityBar(op: Operative): AbilityId[] {
  const shared: AbilityId[] = ['throw-stone', 'pistol', 'first-aid'];
  const contextOnly = new Set<AbilityId>(['door', 'carry', 'drop', 'hide-body', 'pick-up', 'free', ...shared]);
  const role = SPECIALIST_RULES[op.role].abilities.filter((a) => !contextOnly.has(a));
  const carrySlot: AbilityId = op.carrying ? 'drop' : 'carry';
  return [...role, ...shared, carrySlot].slice(0, 10);
}
