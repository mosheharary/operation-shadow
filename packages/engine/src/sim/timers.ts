import { distance, type Vec2 } from '../core/math';
import { disableGuard, wakeGuard } from './guards';
import { damageOperative } from './operatives';
import { DIFFICULTY, NOISE_DB } from './rules';
import { DT } from './types';
import type { World } from './world';

const BLAST_KILL_RADIUS = 4;
const BLAST_OBJECT_RADIUS = 3;

export function explode(world: World, pos: Vec2, ownerId: string | null): void {
  const s = world.state;
  world.noise(pos, NOISE_DB.explosion, 'explosion', ownerId);
  world.emit({ type: 'explosion', pos: { ...pos } });
  for (const g of s.guards) {
    if (g.status === 'dead' || distance(g.pos, pos) > BLAST_KILL_RADIUS) continue;
    disableGuard(world, g, 'dead');
    s.stats.kills += 1;
  }
  for (const op of s.operatives) {
    if (distance(op.pos, pos) <= BLAST_KILL_RADIUS) damageOperative(world, op, 150, 'explosion');
  }
  for (const obj of s.objects) {
    if (distance(obj.pos, pos) > BLAST_OBJECT_RADIUS) continue;
    if ('sabotaged' in obj) {
      obj.destroyed = true;
      obj.sabotaged = true;
      world.log('success', `${obj.label} destroyed`);
    } else if (obj.type === 'door') {
      obj.locked = false;
      world.setDoor(obj, true, ownerId ?? 'explosion');
    } else if (obj.type === 'fence' && obj.cutCells.length === 0) {
      world.cutFence(obj, pos);
    } else if (obj.type === 'prisoner' && !obj.freed) {
      obj.alive = false;
    }
  }
  world.raiseAlarm(3, 'Explosion', world.sectorAt(pos), pos);
}

/** Charges, smoke, unconscious guards coming round, footprint fading and searchlight sweeps. */
export function updateWorldTimers(world: World): void {
  const s = world.state;
  for (const obj of [...s.objects]) {
    if (obj.type === 'charge' && s.tick >= obj.detonateAt) {
      world.removeObject(obj.id);
      explode(world, obj.pos, obj.owner);
    }
    if (obj.type === 'searchlight' && !obj.sabotaged && !obj.destroyed && obj.sweepArc && obj.sweepPeriod) {
      obj.heading = (obj.baseHeading ?? 0) + (Math.sin((s.tick * DT * Math.PI * 2) / obj.sweepPeriod) * obj.sweepArc) / 2;
    }
  }
  if (s.smoke.length > 0) s.smoke = s.smoke.filter((cloud) => cloud.until > s.tick);
  for (const g of s.guards) {
    if (g.status === 'ko' && s.tick >= g.koUntil) wakeGuard(world, g);
  }
  const maxAge = DIFFICULTY[s.difficulty].footprintSeconds * 20;
  if (s.footprints.length > 0 && s.tick - s.footprints[0]!.tick > maxAge) {
    s.footprints = s.footprints.filter((fp) => s.tick - fp.tick <= maxAge);
  }
}
