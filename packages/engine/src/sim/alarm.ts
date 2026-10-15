import type { Vec2 } from '../core/math';
import { WEATHER_NOISE_FLOOR } from './rules';
import { type AlarmLevel, type Guard, seconds } from './types';
import type { World } from './world';

export const ALARM_LABELS: Record<AlarmLevel, string> = {
  0: 'Routine',
  1: 'Local suspicion',
  2: 'Active investigation',
  3: 'Sector alert',
  4: 'Full alert',
};

/** How long a persistent escalation lasts without new escalations before stepping down. */
const DECAY: Record<number, number> = { 2: seconds(60), 3: seconds(120), 4: seconds(180) };
const SIREN_DB = 22;

/** Raises the persistent alarm (never lowers it). Spawns reinforcements and sirens per level. */
export function raiseAlarm(world: World, level: AlarmLevel, reason: string, sector: string, pos: Vec2): void {
  const s = world.state;
  const a = s.alarm;
  if (level >= 2) a.lastEscalationTick = s.tick;
  if (level <= a.persistent) return;
  const previous = a.level;
  a.persistent = level;
  if (level > a.level) {
    a.level = level;
    a.since = s.tick;
  }
  if (level > a.peak) a.peak = level;
  if (level > s.stats.peakAlarm) s.stats.peakAlarm = level;
  if (level >= 3) {
    s.stats.alarmsRaised += 1;
    a.floor = Math.max(a.floor, 1) as AlarmLevel;
  }
  world.emit({ type: 'alarm', level: a.level, previous, reason });
  world.log(level >= 3 ? 'danger' : 'warning', `${ALARM_LABELS[level]}: ${reason}`);
  if (level >= 3) dispatchReinforcements(world, sector, pos);
  if (level >= 4) {
    a.sirens = true;
    for (const g of s.guards) if (g.status === 'active') g.alertness = 1;
  }
}

function dispatchReinforcements(world: World, sector: string, pos: Vec2): void {
  const s = world.state;
  for (const spawn of world.mission.reinforcementSpawns) {
    if (spawn.sector !== sector && s.alarm.persistent < 4) continue;
    const key = `reinforce:${spawn.sector}:${spawn.pos.x}:${spawn.pos.z}`;
    if (s.director.fired.includes(key)) continue;
    s.director.fired.push(key);
    for (let i = 0; i < spawn.count; i += 1) {
      const offset = { x: spawn.pos.x + (i % 2) * 0.8, z: spawn.pos.z + Math.floor(i / 2) * 0.8 };
      world.spawnReinforcement(spawn.sector, offset, pos);
    }
    s.alarm.reinforcementsSent += spawn.count;
    world.log('danger', `Reinforcements deployed (${spawn.count})`);
  }
}

function derivedLevel(guards: Guard[]): AlarmLevel {
  let level: AlarmLevel = 0;
  for (const g of guards) {
    if (g.status !== 'active') continue;
    if (g.state === 'combat' || g.state === 'alerted') return 3;
    if (g.state === 'investigate' || g.state === 'search' || g.state === 'revive' || g.state === 'challenge') level = 2;
    else if ((g.state === 'observe' || g.state === 'suspicious') && level < 1) level = 1;
  }
  return level;
}

export function updateAlarm(world: World): void {
  const s = world.state;
  const a = s.alarm;
  const fighting = s.guards.some((g) => g.status === 'active' && (g.state === 'combat' || g.state === 'alerted'));
  if (a.persistent >= 2 && !fighting && s.tick - a.lastEscalationTick > (DECAY[a.persistent] ?? seconds(60))) {
    const next = Math.max(a.floor, a.persistent - 1) as AlarmLevel;
    if (next < a.persistent) {
      a.persistent = next;
      a.lastEscalationTick = s.tick;
      world.log('info', `Alarm easing to: ${ALARM_LABELS[next]}`);
    }
  }
  if (a.persistent < 4) a.sirens = false;
  const effective = Math.max(a.persistent, derivedLevel(s.guards), a.floor) as AlarmLevel;
  if (effective !== a.level) {
    const previous = a.level;
    a.level = effective;
    a.since = s.tick;
    if (effective > a.peak) a.peak = effective;
    if (effective > s.stats.peakAlarm) s.stats.peakAlarm = effective;
    world.emit({ type: 'alarm', level: effective, previous, reason: effective > previous ? 'Guards are alert' : 'Guards are calming down' });
  }
  s.env.noiseFloor = (WEATHER_NOISE_FLOOR[s.env.weather] ?? 28) + (a.sirens ? SIREN_DB : 0);
}
