import type { Vec2 } from '../core/math';
import type { ObjectiveDef } from './mission';
import type { ObjectiveState, OutcomeCode } from './types';
import type { World } from './world';

function inZone(world: World, zoneId: string, pos: Vec2): boolean {
  const zone = world.level.zones.find((z) => z.id === zoneId);
  return Boolean(zone) && pos.x >= zone!.min.x && pos.x <= zone!.max.x && pos.z >= zone!.min.z && pos.z <= zone!.max.z;
}

function setStatus(world: World, state: ObjectiveState, def: ObjectiveDef, status: ObjectiveState['status']): void {
  if (state.status === status) return;
  state.status = status;
  if (status === 'completed') state.completedTick = world.state.tick;
  world.emit({ type: 'objective', id: state.id, status });
  if (status === 'completed') world.log('success', `Objective complete: ${def.title}`);
  if (status === 'failed') world.log('danger', `Objective failed: ${def.title}`);
}

export function finishMission(world: World, status: 'success' | 'failed', code: OutcomeCode, message: string): void {
  const s = world.state;
  if (s.status !== 'running') return;
  s.status = status;
  s.outcome = { code, message, tick: s.tick };
  world.emit({ type: 'mission', status, code });
  world.log(status === 'success' ? 'success' : 'danger', message);
}

function evaluate(world: World, def: ObjectiveDef): 'completed' | 'failed' | null {
  switch (def.kind) {
    case 'disable-target': {
      const target = world.object(def.targetId);
      return target && 'sabotaged' in target && (target.sabotaged || target.destroyed) ? 'completed' : null;
    }
    case 'acquire-item': {
      const item = world.object(def.itemObjectId);
      return item?.type === 'item' && item.takenBy ? 'completed' : null;
    }
    case 'rescue': {
      const prisoner = world.object(def.prisonerId);
      if (prisoner?.type !== 'prisoner') return null;
      if (!prisoner.alive) return 'failed';
      return prisoner.extracted ? 'completed' : null;
    }
    case 'reach-zone':
      return world.state.operatives.some((op) => op.status === 'active' && inZone(world, def.zoneId, op.pos)) ? 'completed' : null;
  }
}

/** Objective progress, extraction and every mission-ending condition, checked once per tick. */
export function updateObjectives(world: World): void {
  const s = world.state;
  if (s.status !== 'running') return;

  const dead = s.operatives.find((op) => op.status === 'dead');
  if (dead) {
    finishMission(world, 'failed', 'operative-killed', `Mission failed: ${dead.role} was killed`);
    return;
  }
  const living = s.operatives.filter((op) => op.status !== 'dead');
  if (living.length > 0 && living.every((op) => op.status === 'captured')) {
    finishMission(world, 'failed', 'all-captured', 'Mission failed: the whole squad was captured');
    return;
  }
  const failAt = world.mission.failAtAlarm;
  if (failAt !== null && s.alarm.level >= failAt) {
    finishMission(world, 'failed', 'alarm-limit', 'Mission failed: the alarm was raised');
    return;
  }

  for (const def of world.mission.objectives) {
    const state = s.objectives.find((o) => o.id === def.id);
    if (!state || state.status === 'hidden' || state.status === 'completed' || state.status === 'failed') continue;
    const result = evaluate(world, def);
    if (result) setStatus(world, state, def, result);
  }

  const requiredFailed = world.mission.objectives.find((def) => def.required && s.objectives.find((o) => o.id === def.id)?.status === 'failed');
  if (requiredFailed) {
    finishMission(world, 'failed', 'objective-impossible', `Mission failed: ${requiredFailed.title} can no longer be completed`);
    return;
  }

  const requiredDone = world.mission.objectives.every((def) => !def.required || s.objectives.find((o) => o.id === def.id)?.status === 'completed');
  if (!requiredDone) return;
  const zoneId = world.mission.extractionZoneId;
  const squad = s.operatives.filter((op) => op.status !== 'dead');
  if (squad.some((op) => op.status === 'captured' || op.status === 'downed')) return;
  if (!squad.every((op) => inZone(world, zoneId, op.pos))) return;

  // Escorted prisoners leave with the squad.
  for (const obj of s.objects) {
    if (obj.type === 'prisoner' && obj.freed && obj.alive && inZone(world, zoneId, obj.pos)) obj.extracted = true;
  }
  for (const def of world.mission.objectives) {
    const state = s.objectives.find((o) => o.id === def.id)!;
    const result = state.status === 'active' ? evaluate(world, def) : null;
    if (result) setStatus(world, state, def, result);
    if (state.status === 'active') setStatus(world, state, def, 'failed');
  }
  for (const op of squad) {
    op.status = 'extracted';
    world.emit({ type: 'operative-status', unitId: op.id, status: 'extracted' });
  }
  finishMission(world, 'success', 'extracted', 'Mission complete: the squad has extracted');
}
