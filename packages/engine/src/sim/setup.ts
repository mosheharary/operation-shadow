import { seedRng } from '../core/rng';
import { distance } from '../core/math';
import { Grid } from '../level/grid';
import type { LevelData } from '../level/types';
import type { GuardSpawn, MissionRuntime, ObjectSpawn } from './mission';
import { ambientLightAt, SPECIALIST_RULES, WEATHER_NOISE_FLOOR } from './rules';
import { type DifficultyId, type Guard, type Operative, seconds, type SimState, type SpecialistId, type WorldObject } from './types';

export interface WorldSetup {
  seed: number;
  squad: SpecialistId[];
  difficulty: DifficultyId;
}

export class SetupError extends Error {}

/** Checks a chosen squad against the mission's size and capability requirements. */
export function validateSquad(mission: MissionRuntime, squad: SpecialistId[]): string | null {
  if (new Set(squad).size !== squad.length) return 'Each specialist can only be deployed once';
  if (squad.length < mission.squadSize.min || squad.length > mission.squadSize.max) {
    return `This operation needs ${mission.squadSize.min}–${mission.squadSize.max} specialists`;
  }
  if (squad.length > mission.squadSpawns.length) return 'Not enough insertion points for this squad';
  const missing = mission.requiredRoles.filter((role) => !squad.includes(role));
  if (missing.length > 0) return `This operation requires: ${missing.join(', ')}`;
  return null;
}

export function createOperative(role: SpecialistId, spawn: { pos: { x: number; z: number }; facing: number }): Operative {
  const rules = SPECIALIST_RULES[role];
  return {
    id: `op:${role}`,
    role,
    pos: { ...spawn.pos },
    facing: spawn.facing,
    stance: 'crouch',
    gait: 'walk',
    health: rules.maxHealth,
    maxHealth: rules.maxHealth,
    status: 'active',
    bleedOut: 0,
    inventory: { ...rules.inventory },
    carrying: null,
    disguised: false,
    suspiciousUntil: 0,
    submerged: false,
    escortedBy: null,
    action: null,
    queue: [],
    cooldowns: {},
    stride: 0,
    lastMoveTick: -10,
    lastGait: 'walk',
    noticedBy: [],
  };
}

export function createGuard(level: LevelData, spawn: GuardSpawn, startState?: Guard['state']): Guard {
  const post = spawn.postId ? level.posts.find((p) => p.id === spawn.postId) : undefined;
  const route = spawn.routeId ? level.routes.find((r) => r.id === spawn.routeId) : undefined;
  if (spawn.postId && !post) throw new SetupError(`Guard ${spawn.id} references unknown post ${spawn.postId}`);
  if (spawn.routeId && !route) throw new SetupError(`Guard ${spawn.id} references unknown route ${spawn.routeId}`);
  const start = route ? (spawn.routeStart ?? 0) % route.points.length : 0;
  const pos = spawn.pos ?? post?.pos ?? route?.points[start];
  if (!pos) throw new SetupError(`Guard ${spawn.id} has no position`);
  const facing = spawn.facing ?? post?.facing ?? 0;
  return {
    id: spawn.id,
    archetype: spawn.archetype,
    rank: spawn.rank,
    temperament: spawn.temperament,
    pos: { ...pos },
    facing,
    look: 0,
    eyeElevation: post?.elevation ?? 0,
    health: 100,
    status: 'active',
    koUntil: 0,
    state: startState ?? (route ? 'patrol' : 'post'),
    stateSince: 0,
    postId: post?.id ?? null,
    routeId: route?.id ?? null,
    routeIndex: route ? (start + 1) % route.points.length : 0,
    waitUntil: 0,
    home: { pos: { ...pos }, facing },
    path: null,
    pathIndex: 0,
    suspicion: [],
    focus: null,
    memory: [],
    goal: null,
    goalKind: null,
    goalSource: null,
    bellId: null,
    alertness: 0,
    targetId: null,
    aimUntil: 0,
    nextShotTick: 0,
    lostSightTick: 0,
    searchPoints: [],
    searchIndex: 0,
    searchUntil: 0,
    lookUntil: 0,
    distractedBy: null,
    distractedUntil: 0,
    escorting: null,
    challengeStillSince: -1,
    lastPerceptionTick: -1,
    sector: spawn.sector,
    radio: spawn.radio ?? false,
    carriesLantern: spawn.lantern ?? false,
    carriedBy: null,
    hiddenIn: null,
    found: false,
    tagged: false,
    barked: false,
  };
}

function createObject(grid: Grid, spawn: ObjectSpawn): WorldObject {
  switch (spawn.type) {
    case 'door': {
      const radius = (spawn.width ?? 1.2) / 2 + 0.05;
      const cells = grid.cellsInRadius(spawn.pos, radius).filter((cell) => distance(grid.center(cell), spawn.pos) <= radius);
      return { id: spawn.id, type: 'door', pos: { ...spawn.pos }, cells, open: spawn.open ?? false, locked: spawn.locked ?? false };
    }
    case 'fence':
      return { id: spawn.id, type: 'fence', pos: { ...spawn.pos }, cells: [...spawn.cells], cutCells: [] };
    case 'item':
      return { id: spawn.id, type: 'item', pos: { ...spawn.pos }, item: spawn.item, amount: spawn.amount, takenBy: null };
    case 'container':
      return { id: spawn.id, type: 'container', pos: { ...spawn.pos }, capacity: spawn.capacity, contents: [] };
    case 'prisoner':
      return { id: spawn.id, type: 'prisoner', pos: { ...spawn.pos }, freed: false, following: null, extracted: false, alive: true };
    default: {
      const target: WorldObject = {
        id: spawn.id,
        type: spawn.type,
        pos: { ...spawn.pos },
        label: spawn.label,
        sector: spawn.sector,
        sabotaged: false,
        destroyed: false,
      };
      if (spawn.heading !== undefined) {
        target.heading = spawn.heading;
        target.baseHeading = spawn.heading;
      }
      if (spawn.sweepArc !== undefined) target.sweepArc = spawn.sweepArc;
      if (spawn.sweepPeriod !== undefined) target.sweepPeriod = spawn.sweepPeriod;
      if (spawn.range !== undefined) target.range = spawn.range;
      return target;
    }
  }
}

/** Builds the initial, fully serializable simulation state for a mission and chosen squad. */
export function createInitialState(level: LevelData, mission: MissionRuntime, setup: WorldSetup): SimState {
  const squadError = validateSquad(mission, setup.squad);
  if (squadError) throw new SetupError(squadError);
  const grid = new Grid(level);
  const ids = new Set<string>();
  const unique = (id: string) => {
    if (ids.has(id)) throw new SetupError(`Duplicate entity id ${id}`);
    ids.add(id);
    return id;
  };
  const guards = mission.guards.map((spawn) => {
    unique(spawn.id);
    return createGuard(level, spawn);
  });
  const objects = mission.objects.map((spawn) => {
    unique(spawn.id);
    return createObject(grid, spawn);
  });
  const { timeOfDay, weather } = mission.env;
  return {
    schemaVersion: 1,
    missionId: mission.id,
    levelId: level.id,
    seed: setup.seed >>> 0,
    difficulty: setup.difficulty,
    tick: 0,
    rng: seedRng(setup.seed),
    status: 'running',
    outcome: null,
    env: { timeOfDay, weather, ambientLight: ambientLightAt(timeOfDay, weather), noiseFloor: WEATHER_NOISE_FLOOR[weather] ?? 28 },
    operatives: setup.squad.map((role, i) => createOperative(role, mission.squadSpawns[i]!)),
    guards,
    objects,
    footprints: [],
    noises: [],
    smoke: [],
    alarm: { level: 0, persistent: 0, since: 0, peak: 0, floor: 0, lastEscalationTick: 0, lastContactTick: 0, reinforcementsSent: 0, sirens: false },
    objectives: mission.objectives.map((o) => ({ id: o.id, status: o.hidden ? 'hidden' : 'active', completedTick: null })),
    director: {
      fired: [],
      // A separate stream, so a mission with a deck leaves the main simulation's randomness untouched.
      ...(mission.deck ? { deck: { nextTick: seconds(mission.deck.firstAtSeconds), drawn: 0, complications: 0, rng: seedRng((setup.seed ^ 0xdec4) >>> 0) } } : {}),
    },
    stats: {
      detections: 0,
      alarmsRaised: 0,
      peakAlarm: 0,
      kills: 0,
      knockouts: 0,
      restrained: 0,
      bodiesFound: 0,
      shotsFired: 0,
      injuries: 0,
      downs: 0,
      captures: 0,
      itemsUsed: {},
      distance: 0,
    },
    log: [],
    nextId: 1,
  };
}
