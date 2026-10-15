import { angleDelta, distance, headingTo, type Vec2 } from '../core/math';
import { DynamicGrid } from '../level/dynamic';
import { Grid } from '../level/grid';
import type { LevelData } from '../level/types';
import { type NavProfile, Pathfinder } from '../nav/pathfinder';
import { TARGET_HEIGHT, traceSight } from '../sight/los';
import type { MissionRuntime } from '../sim/mission';
import { GUARD_NAV, SPECIALIST_RULES } from '../sim/rules';
import { SPECIALISTS, type SpecialistId } from '../sim/types';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface MissionValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  stats: {
    guards: number;
    objectives: number;
    walkableCells: number;
    watchedCells: number;
    primaryRouteMetres: number | null;
    stealthRouteMetres: number | null;
  };
  durationMs: number;
}

function capabilities(roles: readonly SpecialistId[]): NavProfile {
  return {
    swim: roles.some((r) => SPECIALIST_RULES[r].nav.swim),
    climb: roles.some((r) => SPECIALIST_RULES[r].nav.climb),
  };
}

function zoneCentre(level: LevelData, id: string): Vec2 | null {
  const z = level.zones.find((zone) => zone.id === id && zone.kind !== 'sector');
  return z ? { x: (z.min.x + z.max.x) / 2, z: (z.min.z + z.max.z) / 2 } : null;
}

/**
 * Validates a resolved mission against its level before anyone plays it: references,
 * reachability of every objective and the extraction with the capabilities the squad is
 * guaranteed to have, guard placements, and a stealth-feasibility heuristic.
 */
export function validateMission(level: LevelData, mission: MissionRuntime): MissionValidationReport {
  const started = Date.now();
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string) => issues.push({ severity: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ severity: 'warning', code, message });
  const grid = new Grid(level);
  const objects = new Map(mission.objects.map((o) => [o.id, o]));

  // References and structure.
  if (!mission.objectives.some((o) => o.required)) error('no-primary', 'The mission has no required objective');
  for (const o of mission.objectives) {
    if (o.kind === 'disable-target' && objects.get(o.targetId)?.type !== 'objective-target' && !['radio', 'alarm-bell', 'searchlight'].includes(objects.get(o.targetId)?.type ?? '')) {
      error('bad-reference', `Objective ${o.id} targets a missing object ${o.targetId}`);
    }
    if (o.kind === 'acquire-item' && objects.get(o.itemObjectId)?.type !== 'item') error('bad-reference', `Objective ${o.id} needs item ${o.itemObjectId}`);
    if (o.kind === 'rescue' && objects.get(o.prisonerId)?.type !== 'prisoner') error('bad-reference', `Objective ${o.id} needs prisoner ${o.prisonerId}`);
    if (o.kind === 'reach-zone' && !zoneCentre(level, o.zoneId)) error('bad-reference', `Objective ${o.id} needs zone ${o.zoneId}`);
  }
  const extraction = zoneCentre(level, mission.extractionZoneId);
  if (!extraction) error('no-extraction', `Extraction zone ${mission.extractionZoneId} does not exist`);
  if (mission.holdingZoneId && !zoneCentre(level, mission.holdingZoneId)) error('bad-reference', `Holding zone ${mission.holdingZoneId} does not exist`);
  if (mission.squadSpawns.length < mission.squadSize.max) error('spawns', 'Fewer insertion points than the maximum squad size');
  for (const role of mission.requiredRoles) if (!SPECIALISTS.includes(role)) error('bad-role', `Unknown required role ${role}`);

  // Doors: the guaranteed squad can open locked doors only if it brings the Combat Engineer.
  const dynamic = new DynamicGrid(level);
  const pf = new Pathfinder(level, dynamic);
  const required = capabilities(mission.requiredRoles);
  const canPick = mission.requiredRoles.includes('engineer');
  const lockedCells = mission.objects
    .filter((o): o is Extract<typeof o, { type: 'door' }> => o.type === 'door' && Boolean(o.locked))
    .flatMap((door) => grid.cellsInRadius(door.pos, (door.width ?? 1.2) / 2 + 0.05));
  const applyDoors = (pickLocks: boolean) => {
    dynamic.reset();
    if (!pickLocks) dynamic.block(lockedCells);
  };

  for (const spawn of mission.squadSpawns) {
    if (!pf.isPassableAt(spawn.pos, { swim: false, climb: false })) error('spawn-blocked', `Insertion point (${spawn.pos.x}, ${spawn.pos.z}) is not walkable`);
  }
  const start = mission.squadSpawns[0]?.pos;

  const reach = (target: Vec2, profile: NavProfile) => (start ? pf.findPath(start, target, profile) : null);
  let primaryRouteMetres: number | null = null;
  let primaryTarget: Vec2 | null = null;
  const allRoles = capabilities(SPECIALISTS);

  for (const o of mission.objectives) {
    const pos =
      o.kind === 'disable-target' ? objects.get(o.targetId)?.pos
      : o.kind === 'acquire-item' ? objects.get(o.itemObjectId)?.pos
      : o.kind === 'rescue' ? objects.get(o.prisonerId)?.pos
      : zoneCentre(level, o.zoneId);
    if (!pos) continue;
    applyDoors(o.required ? canPick : true);
    const result = reach(pos, o.required ? required : allRoles);
    if (!result?.ok || distance(result.points.at(-1)!, pos) > 2.2) {
      if (o.required) error('unreachable-objective', `Required objective "${o.title}" cannot be reached by the guaranteed squad`);
      else warn('unreachable-optional', `Optional objective "${o.title}" cannot be reached`);
    } else if (o.required && primaryRouteMetres === null) {
      primaryRouteMetres = Math.round(result.cost);
      primaryTarget = pos;
    }
  }
  applyDoors(canPick);
  if (extraction && start) {
    const back = pf.findPath(start, extraction, required);
    if (!back.ok) error('unreachable-extraction', 'The extraction zone cannot be reached');
  }

  // Guards.
  for (const g of mission.guards) {
    const postDef = g.postId ? level.posts.find((p) => p.id === g.postId) : undefined;
    const routeDef = g.routeId ? level.routes.find((r) => r.id === g.routeId) : undefined;
    if (g.postId && !postDef) error('bad-post', `Guard ${g.id} uses unknown post ${g.postId}`);
    if (g.routeId && !routeDef) error('bad-route', `Guard ${g.id} uses unknown route ${g.routeId}`);
    if (postDef && !postDef.elevation && !pf.isPassableAt(postDef.pos, GUARD_NAV)) error('post-blocked', `Post ${postDef.id} is not walkable`);
    if (routeDef) {
      for (let i = 1; i < routeDef.points.length; i += 1) {
        if (!pf.findPath(routeDef.points[0]!, routeDef.points[i]!, GUARD_NAV).ok) error('route-broken', `Route ${routeDef.id} point ${i} is unreachable`);
      }
    }
  }
  for (const r of mission.reinforcementSpawns) {
    if (!pf.isPassableAt(r.pos, GUARD_NAV)) error('reinforcement-blocked', `Reinforcement spawn for ${r.sector} is not walkable`);
  }

  // Stealth feasibility: block every cell inside a stationary guard's near zone that it can see.
  const watched = new Set<number>();
  for (const g of mission.guards) {
    const postDef = g.postId ? level.posts.find((p) => p.id === g.postId) : undefined;
    if (!postDef || postDef.sweepArc) continue;
    const eyeY = grid.heightAt(postDef.pos) + 1.6 + (postDef.elevation ?? 0);
    const ctx = { level, grid, dynamic, smoke: [] };
    for (const cell of grid.cellsInRadius(postDef.pos, 7)) {
      const c = grid.center(cell);
      if (distance(c, postDef.pos) > 1.4 && Math.abs(angleDelta(postDef.facing, headingTo(postDef.pos, c))) > (50 * Math.PI) / 180) continue;
      if (traceSight(ctx, postDef.pos, eyeY, c, level.cellHeight[cell]! + TARGET_HEIGHT.prone).clear) watched.add(cell);
    }
  }
  let stealthRouteMetres: number | null = null;
  if (primaryTarget && start) {
    applyDoors(canPick);
    dynamic.block([...watched].filter((cell) => distance(grid.center(cell), primaryTarget!) > 2));
    const sneak = pf.findPath(start, primaryTarget, required);
    if (sneak.ok) stealthRouteMetres = Math.round(sneak.cost);
    else warn('no-stealth-route', 'Every route to the primary objective passes through a permanently watched area');
  }

  let walkableCells = 0;
  for (let i = 0; i < level.flags.length; i += 1) if (level.flags[i]! & 1) walkableCells += 1;

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    stats: {
      guards: mission.guards.length,
      objectives: mission.objectives.length,
      walkableCells,
      watchedCells: watched.size,
      primaryRouteMetres,
      stealthRouteMetres,
    },
    durationMs: Date.now() - started,
  };
}
