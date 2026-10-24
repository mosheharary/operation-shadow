import { distance, type Vec2 } from '../core/math';
import { callOffSearch, sendToBarracks } from './guards';
import { SPY_COVER_ALARM, WEATHER_NOISE_FLOOR } from './rules';
import { type AlarmLevel, type Guard, seconds } from './types';
import type { World } from './world';

export const ALARM_LABELS: Record<AlarmLevel, string> = {
  0: 'Routine',
  1: 'Local suspicion',
  2: 'Active investigation',
  3: 'Sector alert',
  4: 'Full alert',
};

/** Records a new alarm peak. The first sector alert blows the spy's cover for good. */
function setPeak(world: World, level: AlarmLevel): void {
  const a = world.state.alarm;
  if (a.peak < SPY_COVER_ALARM && level >= SPY_COVER_ALARM) {
    for (const op of world.state.operatives) {
      if (op.role === 'spy' && op.status !== 'dead' && op.status !== 'extracted') world.log('danger', `${op.role}: cover blown. Every soldier now knows his face`);
    }
  }
  a.peak = level;
}

/** A raised alarm (investigation or alert) clears after this long without a guard seeing or fighting the squad. */
export const STAND_DOWN = seconds(30);
const SIREN_DB = 22;

/** Raises the persistent alarm (never lowers it). Spawns reinforcements and sirens per level. */
export function raiseAlarm(world: World, level: AlarmLevel, reason: string, sector: string, pos: Vec2): void {
  const s = world.state;
  const a = s.alarm;
  if (level >= 2) a.lastEscalationTick = s.tick;
  if (level <= a.persistent) return;
  const previous = a.level;
  // A newly raised alarm starts its stand-down clock now, not at the last contact of an earlier one.
  a.lastContactTick = s.tick;
  a.persistent = level;
  if (level > a.level) {
    a.level = level;
    a.since = s.tick;
  }
  if (level > s.stats.peakAlarm) s.stats.peakAlarm = level;
  if (level >= 3) s.stats.alarmsRaised += 1;
  world.emit({ type: 'alarm', level: a.level, previous, reason });
  world.log(level >= 3 ? 'danger' : 'warning', `${ALARM_LABELS[level]}: ${reason}`);
  // After the alarm line, so the cover-blown note reads as its consequence.
  if (level > a.peak) setPeak(world, level);
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
      world.spawnReinforcement(spawn.sector, offset, pos, true);
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

/**
 * Ticks since a guard last saw or fought the squad, or the alarm was raised to a new level. Guards
 * merely shouting the alarm on to each other do not count: that is not finding anyone.
 */
function quietTicks(world: World): number {
  return world.state.tick - world.state.alarm.lastContactTick;
}

const inContact = (world: World) => world.state.guards.some((g) => g.status === 'active' && g.state === 'combat');

/**
 * Seconds until a raised alarm clears, or 'contact' while a guard is fighting the squad. Null when
 * no alarm is raised (guards merely looking into something clear on their own).
 */
export function standDownIn(world: World): number | 'contact' | null {
  if (world.state.alarm.persistent < 2) return null;
  if (inContact(world)) return 'contact';
  return Math.max(0, Math.ceil((STAND_DOWN - quietTicks(world)) / seconds(1)));
}

/** All clear: back to routine. Sirens stop, searches are called off and reinforcements march back to their barracks. */
function standDown(world: World): void {
  const s = world.state;
  const a = s.alarm;
  const wasAlert = a.persistent >= 3;
  a.persistent = a.floor;
  a.lastEscalationTick = s.tick;
  a.sirens = false;
  for (const g of s.guards) {
    if (g.status !== 'active') continue;
    if (g.barracks) sendToBarracks(world, g);
    else callOffSearch(world, g);
    // Forget the alarm shouts just heard, or the first guard back on his rounds would raise it again.
    g.focus = null;
  }
  s.noises = s.noises.filter((n) => n.kind !== 'alarm-shout');
  // The barracks can turn out again for the next alarm.
  s.director.fired = s.director.fired.filter((key) => !key.startsWith('reinforce:'));
  if (wasAlert) world.emit({ type: 'all-clear' });
  world.log('info', 'All clear: nobody found for 30 s. Guards return to their posts');
}

/** Reinforcements back at their barracks go inside once the alert is over. */
function retireReinforcements(world: World): void {
  const s = world.state;
  if (s.alarm.persistent >= 3) return;
  for (const g of [...s.guards]) {
    if (g.status === 'active' && g.barracks && g.state === 'post' && distance(g.pos, g.barracks) <= 0.6) world.removeGuard(g.id);
  }
}

export function updateAlarm(world: World): void {
  const s = world.state;
  const a = s.alarm;
  if (a.persistent >= 2) {
    for (const op of s.operatives) a.lastContactTick = Math.max(a.lastContactTick, op.lastSpottedTick ?? -1);
    if (inContact(world)) a.lastContactTick = s.tick;
    else if (quietTicks(world) > STAND_DOWN) standDown(world);
  }
  retireReinforcements(world);
  if (a.persistent < 4) a.sirens = false;
  const effective = Math.max(a.persistent, derivedLevel(s.guards), a.floor) as AlarmLevel;
  if (effective !== a.level) {
    const previous = a.level;
    a.level = effective;
    a.since = s.tick;
    if (effective > a.peak) setPeak(world, effective);
    if (effective > s.stats.peakAlarm) s.stats.peakAlarm = effective;
    world.emit({ type: 'alarm', level: effective, previous, reason: effective > previous ? 'Guards are alert' : 'Guards are calming down' });
  }
  s.env.noiseFloor = (WEATHER_NOISE_FLOOR[s.env.weather] ?? 28) + (a.sirens ? SIREN_DB : 0);
}
