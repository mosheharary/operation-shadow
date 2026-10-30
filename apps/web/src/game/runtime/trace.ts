import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { type AlarmLevel, ALARM_LABELS, type GameEvent, type SpecialistId, TICK_RATE, type Vec2, type World } from '@operation-shadow/engine';

/** A point on a squad member's route. */
export interface TracePoint {
  tick: number;
  x: number;
  z: number;
}

/** One squad member's whole route through the mission. */
export interface TraceRoute {
  id: string;
  role: SpecialistId;
  points: TracePoint[];
}

export type IncidentKind = 'spotted' | 'body-found' | 'takedown' | 'killed' | 'objective' | 'casualty' | 'extracted';

/** Something worth a stamp on the after-action chart: what happened, where and when. */
export interface TraceIncident {
  tick: number;
  kind: IncidentKind;
  pos: Vec2;
  text: string;
}

/** The alarm level from this tick on (a step graph along the chart's time strip). */
export interface AlarmStep {
  tick: number;
  level: AlarmLevel;
}

/** The part of the map the chart shows (metres). */
export interface ChartView {
  x: number;
  z: number;
  width: number;
  depth: number;
}

/** The chart's shape (width over depth) and how much ground it always shows around the action. */
export const CHART_ASPECT = 1.75;
const CHART_PAD = 10;
const CHART_MIN_WIDTH = 56;

/** A spotted stamp is not repeated for the same squad member within this many ticks. */
export const SPOTTED_GAP_TICKS = 6 * TICK_RATE;

/** A route point every half second of mission time... */
export const TRACE_INTERVAL_TICKS = TICK_RATE / 2;
/** ...unless the squad member has barely moved (metres). */
export const TRACE_MIN_STEP = 0.5;

/** Where an objective sits on the map: its target, item or prisoner, or the middle of its zone. */
export function objectivePos(world: World, objectiveId: string): Vec2 | null {
  const def = world.mission.objectives.find((d) => d.id === objectiveId);
  if (!def) return null;
  if (def.kind === 'reach-zone') {
    const zone = world.level.zones.find((z) => z.id === def.zoneId);
    return zone ? { x: (zone.min.x + zone.max.x) / 2, z: (zone.min.z + zone.max.z) / 2 } : null;
  }
  const id = def.kind === 'disable-target' ? def.targetId : def.kind === 'acquire-item' ? def.itemObjectId : def.prisonerId;
  const obj = world.object(id);
  return obj ? { ...obj.pos } : null;
}

/** The stamp an event leaves on the chart, or null for the everyday ones (and ones with no place). */
export function incidentFor(e: GameEvent, world: World): Omit<TraceIncident, 'tick'> | null {
  const operative = (id: string) => {
    const op = world.operative(id);
    return op ? { name: SPECIALIST_PROFILES[op.role].callSign, pos: { ...op.pos } } : null;
  };
  switch (e.type) {
    case 'detected': {
      const op = operative(e.targetId);
      return op ? { kind: 'spotted', pos: op.pos, text: `${op.name} spotted` } : null;
    }
    case 'bark': {
      if (e.line !== 'guard-found-body') return null;
      const guard = world.guard(e.speaker);
      return guard ? { kind: 'body-found', pos: { ...guard.pos }, text: 'Body found by the enemy' } : null;
    }
    case 'guard-status': {
      const guard = world.guard(e.guardId);
      if (!guard) return null;
      if (e.status === 'ko') return { kind: 'takedown', pos: { ...guard.pos }, text: 'Sentry knocked out' };
      if (e.status === 'restrained') return { kind: 'takedown', pos: { ...guard.pos }, text: 'Sentry tied up' };
      if (e.status === 'dead') return { kind: 'killed', pos: { ...guard.pos }, text: 'Sentry killed' };
      return null;
    }
    case 'operative-status': {
      const op = operative(e.unitId);
      if (!op) return null;
      if (e.status === 'extracted') return { kind: 'extracted', pos: op.pos, text: `${op.name} extracted` };
      if (e.status === 'downed') return { kind: 'casualty', pos: op.pos, text: `${op.name} down` };
      if (e.status === 'captured') return { kind: 'casualty', pos: op.pos, text: `${op.name} captured` };
      if (e.status === 'dead') return { kind: 'casualty', pos: op.pos, text: `${op.name} killed` };
      return null;
    }
    case 'objective': {
      if (e.status !== 'completed') return null;
      const pos = objectivePos(world, e.id);
      const title = world.mission.objectives.find((d) => d.id === e.id)?.title ?? 'Objective';
      return pos ? { kind: 'objective', pos, text: `${title}: done` } : null;
    }
    default:
      return null;
  }
}

/**
 * The whole attempt as a chart: every squad member's route, the incidents along the way and
 * the alarm over time, for the debrief's after-action chart. Cheap (a point per member every
 * half second), cut back with the field recorder and restarted on a load. Contains no React.
 */
export class MissionTrace {
  routes: TraceRoute[] = [];
  incidents: TraceIncident[] = [];
  alarm: AlarmStep[] = [];
  /** Mission time the trace starts at (0, or the tick a save was loaded at). */
  startTick = 0;

  /** Starts over from the world as it stands. */
  begin(world: World): void {
    const s = world.state;
    this.startTick = s.tick;
    this.routes = s.operatives.map((op) => ({ id: op.id, role: op.role, points: [{ tick: s.tick, x: op.pos.x, z: op.pos.z }] }));
    this.incidents = [];
    this.alarm = [{ tick: s.tick, level: s.alarm.level }];
  }

  /** Notes this tick's incidents, the alarm and (when due) where everyone is. Call after every tick. */
  observe(events: GameEvent[], world: World): void {
    const s = world.state;
    let ended = false;
    for (const e of events) {
      if (e.type === 'alarm') this.alarm.push({ tick: s.tick, level: e.level });
      else if (e.type === 'mission') ended = true;
      const incident = incidentFor(e, world);
      // The same thing reported twice (two sentries seeing one operative, or one sentry seeing him
      // again a moment later) is one stamp.
      const gap = incident?.kind === 'spotted' ? SPOTTED_GAP_TICKS : 0;
      if (incident && !this.incidents.some((i) => i.text === incident.text && s.tick - i.tick <= gap)) this.incidents.push({ ...incident, tick: s.tick });
    }
    const due = ended || events.some((e) => e.type === 'operative-status') || (s.tick - this.startTick) % TRACE_INTERVAL_TICKS === 0;
    if (!due) return;
    for (const op of s.operatives) {
      const route = this.routes.find((r) => r.id === op.id);
      if (!route) continue;
      const last = route.points[route.points.length - 1];
      if (!ended && last && Math.hypot(op.pos.x - last.x, op.pos.z - last.z) < TRACE_MIN_STEP) continue;
      route.points.push({ tick: s.tick, x: op.pos.x, z: op.pos.z });
    }
  }

  /** Forgets everything after this tick (the field recorder wound the world back to it). */
  cut(tick: number): void {
    for (const route of this.routes) route.points = route.points.filter((p) => p.tick <= tick);
    this.incidents = this.incidents.filter((i) => i.tick <= tick);
    this.alarm = this.alarm.filter((a, i) => i === 0 || a.tick <= tick);
  }
}

/** A squad member's place at a moment: between the route points either side of it. */
export function positionAt(route: TraceRoute, tick: number): Vec2 | null {
  const pts = route.points;
  if (pts.length === 0) return null;
  if (tick <= pts[0]!.tick) return { x: pts[0]!.x, z: pts[0]!.z };
  for (let i = 1; i < pts.length; i += 1) {
    const b = pts[i]!;
    if (b.tick < tick) continue;
    const a = pts[i - 1]!;
    const t = b.tick === a.tick ? 1 : (tick - a.tick) / (b.tick - a.tick);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }
  const last = pts[pts.length - 1]!;
  return { x: last.x, z: last.z };
}

/** Metres a squad member covered up to a moment (the whole route by default). */
export function routeLength(route: TraceRoute, untilTick = Infinity): number {
  let total = 0;
  for (let i = 1; i < route.points.length; i += 1) {
    const a = route.points[i - 1]!;
    const b = route.points[i]!;
    if (a.tick >= untilTick) break;
    const end = b.tick <= untilTick ? b : { ...positionAt(route, untilTick)!, tick: untilTick };
    total += Math.hypot(end.x - a.x, end.z - a.z);
  }
  return total;
}

/** The alarm level standing at a moment. */
export function alarmAt(steps: AlarmStep[], tick: number): AlarmLevel {
  let level: AlarmLevel = 0;
  for (const step of steps) {
    if (step.tick > tick) break;
    level = step.level;
  }
  return level;
}

/** Text for an alarm step on the chart's time strip. */
export function alarmText(level: AlarmLevel): string {
  return `Alarm: ${ALARM_LABELS[level]}`;
}

/** Replay weight of a second in which nobody moved and nothing happened (a busy second weighs 1). */
export const QUIET_WEIGHT = 0.2;

/**
 * How the replay spends its time: quiet stretches (everyone holding still, nothing happening)
 * play five times faster than busy ones. Returns the cumulative weight at each second of the
 * attempt, normalised so it runs 0 to 1, and the attempt's length in weighted seconds.
 */
export function replayPace(trace: Pick<MissionTrace, 'routes' | 'incidents' | 'alarm' | 'startTick'>, endTick: number): { pace: number[]; weighted: number } {
  const seconds = Math.max(1, Math.ceil((endTick - trace.startTick) / TICK_RATE));
  const busy = new Array<boolean>(seconds).fill(false);
  const mark = (tick: number, around = 0) => {
    const at = Math.floor((tick - trace.startTick) / TICK_RATE);
    for (let i = at - around; i <= at + around; i += 1) if (i >= 0 && i < seconds) busy[i] = true;
  };
  for (const route of trace.routes) for (const p of route.points.slice(1)) mark(p.tick - 1);
  for (const incident of trace.incidents) mark(incident.tick, 2);
  for (const step of trace.alarm.slice(1)) mark(step.tick, 1);
  const cumulative = [0];
  for (const b of busy) cumulative.push(cumulative[cumulative.length - 1]! + (b ? 1 : QUIET_WEIGHT));
  const weighted = cumulative[cumulative.length - 1]!;
  return { pace: cumulative.map((c) => c / weighted), weighted };
}

/** The mission tick shown at a point of the replay (0 to 1). */
export function tickAtReplay(pace: number[], startTick: number, endTick: number, progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  let i = 1;
  while (i < pace.length - 1 && pace[i]! < p) i += 1;
  const a = pace[i - 1]!;
  const b = pace[i]!;
  const t = b > a ? (p - a) / (b - a) : 1;
  return Math.min(endTick, startTick + (i - 1 + t) * TICK_RATE);
}

/** The point of the replay (0 to 1) that shows a mission tick: the inverse of tickAtReplay. */
export function replayAtTick(pace: number[], startTick: number, endTick: number, tick: number): number {
  if (tick >= endTick) return 1;
  const s = Math.max(0, (tick - startTick) / TICK_RATE);
  const i = Math.min(pace.length - 2, Math.floor(s));
  const a = pace[i]!;
  const b = pace[i + 1]!;
  return Math.min(1, a + (b - a) * (s - i));
}

/** How long the chart's replay takes for an attempt of this many weighted seconds: a few seconds, longer for an eventful one. */
export function replaySeconds(weightedSeconds: number): number {
  return Math.min(12, Math.max(5, 4 + (weightedSeconds / 60) * 1.5));
}

/**
 * The part of the map worth charting: everything given (routes, stamps, objectives), padded,
 * at least a street wide, in the chart's shape where the map allows, and never off the map.
 */
export function chartView(points: Vec2[], map: { width: number; depth: number }, aspect = CHART_ASPECT): ChartView {
  if (points.length === 0) return { x: 0, z: 0, width: map.width, depth: map.depth };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  let width = Math.max(CHART_MIN_WIDTH, maxX - minX + CHART_PAD * 2);
  let depth = maxZ - minZ + CHART_PAD * 2;
  if (width / depth < aspect) width = depth * aspect;
  else depth = width / aspect;
  width = Math.min(width, map.width);
  depth = Math.min(depth, map.depth);
  const clamp = (centre: number, size: number, limit: number) => Math.max(0, Math.min(limit - size, centre - size / 2));
  return { x: clamp((minX + maxX) / 2, width, map.width), z: clamp((minZ + maxZ) / 2, depth, map.depth), width, depth };
}
