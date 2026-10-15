import type { Vec2 } from '../core/math';
import type { LevelData } from '../level/types';
import type { GameEvent } from '../sim/events';
import type { GuardSpawn, MissionRuntime, ObjectSpawn, ObjectiveDef } from '../sim/mission';
import { TICK_RATE, type DifficultyId, type SpecialistId } from '../sim/types';
import { World } from '../sim/world';

/** Minimal mission around a test level: squad spawns, guards and objects as given. */
export function makeMission(
  level: LevelData,
  options: {
    spawns?: Vec2[];
    guards?: GuardSpawn[];
    objects?: ObjectSpawn[];
    objectives?: ObjectiveDef[];
    timeOfDay?: number;
    weather?: MissionRuntime['env']['weather'];
    extractionZoneId?: string;
    holdingZoneId?: string | null;
    failAtAlarm?: MissionRuntime['failAtAlarm'];
  } = {},
): MissionRuntime {
  const spawns = options.spawns ?? [
    { x: 2, z: 2 },
    { x: 3, z: 2 },
    { x: 4, z: 2 },
    { x: 5, z: 2 },
    { x: 6, z: 2 },
    { x: 7, z: 2 },
  ];
  return {
    id: 'test-mission',
    title: 'Test mission',
    templateId: 'test',
    env: { timeOfDay: options.timeOfDay ?? 12, weather: options.weather ?? 'clear' },
    squadSpawns: spawns.map((pos) => ({ pos, facing: 0 })),
    requiredRoles: [],
    squadSize: { min: 1, max: 6 },
    guards: options.guards ?? [],
    objects: options.objects ?? [],
    objectives: options.objectives ?? [],
    extractionZoneId: options.extractionZoneId ?? 'extraction',
    holdingZoneId: options.holdingZoneId ?? null,
    director: [],
    failAtAlarm: options.failAtAlarm ?? null,
    parSeconds: 300,
    reinforcementSpawns: [],
  };
}

export function makeWorld(level: LevelData, mission: MissionRuntime, squad: SpecialistId[], options: { seed?: number; difficulty?: DifficultyId } = {}): World {
  return World.create(level, mission, { seed: options.seed ?? 7, squad, difficulty: options.difficulty ?? 'standard' });
}

/** Steps the world for `seconds` of simulated time, collecting events. */
export function runFor(world: World, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  const ticks = Math.round(seconds * TICK_RATE);
  for (let i = 0; i < ticks; i += 1) events.push(...world.step());
  return events;
}

/** Steps until the predicate holds or the time limit passes; returns whether it held. */
export function runUntil(world: World, predicate: (world: World) => boolean, maxSeconds: number): boolean {
  const ticks = Math.round(maxSeconds * TICK_RATE);
  for (let i = 0; i < ticks; i += 1) {
    if (predicate(world)) return true;
    world.step();
  }
  return predicate(world);
}
