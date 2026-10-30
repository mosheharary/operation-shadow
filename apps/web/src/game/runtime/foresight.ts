import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { ALARM_LABELS, type SpecialistId, THRESHOLD, TICK_RATE, type Vec2, World } from '@operation-shadow/engine';

/**
 * Foresight: while the game is in tactical pause, the simulation is run ahead on a copy of the
 * world, with the orders already given (including ones given during the pause), to show what the
 * next few seconds hold if play resumed now and nobody did anything else. The simulation is
 * deterministic, so the forecast is exact until the player changes something. It stops at the
 * first sighting, because after that the sentries are reacting to the squad and the future
 * depends on what the player does about it. Pure logic; contains no React or three.js.
 */

/** How far ahead the forecast looks. */
export const FORESIGHT_SECONDS = 10;
/** A point on each track every quarter of a second. */
export const FORESIGHT_SAMPLE_TICKS = TICK_RATE / 4;

/** Where the ghosts' playback is, in seconds ahead (null when foresight is not shown); the HUD reads it every frame. */
export const foresightClock: { t: number | null } = { t: null };

export interface ForesightTrack {
  id: string;
  kind: 'guard' | 'operative';
  /** The squad member's specialist, for their colour. */
  role: SpecialistId | null;
  /** Where the unit stands now (index 0) and every FORESIGHT_SAMPLE_TICKS after. */
  points: Vec2[];
  /** True when the unit gets anywhere in the forecast (a sentry on his post only turns his head). */
  moves: boolean;
}

/** 'unrest' is the alarm rising short of an alert (a sentry investigating a noise); 'alarm' is an alert. */
export type ForesightIncidentKind = 'spotted' | 'noticed' | 'body-found' | 'casualty' | 'objective' | 'unrest' | 'alarm';

export interface ForesightIncident {
  kind: ForesightIncidentKind;
  /** Seconds from now. */
  seconds: number;
  /** Where it happens (the squad member concerned, or the sentry). */
  pos: Vec2;
  /** The sentry involved, and where he stands at that moment, for the thread to the target. */
  guardId: string | null;
  from: Vec2 | null;
  text: string;
}

export interface Forecast {
  /** Mission tick the forecast starts from. */
  fromTick: number;
  /** How far it ran: FORESIGHT_SECONDS, or less when it stopped at a sighting or the mission ended. */
  seconds: number;
  tracks: ForesightTrack[];
  incidents: ForesightIncident[];
  /** The first sighting, which is where the forecast stops. */
  spotted: ForesightIncident | null;
}

const callSign = (world: World, id: string): string => {
  const op = world.operative(id);
  return op ? SPECIALIST_PROFILES[op.role].callSign : 'Someone';
};

/** Less than this far over the whole forecast counts as standing still. */
const STILL_METRES = 0.4;

/**
 * Runs the world ahead on a copy (the real world is never touched) and records where everyone
 * goes and the trouble on the way.
 */
export function forecast(world: World, seconds = FORESIGHT_SECONDS): Forecast {
  const sim = World.restore(world.level, world.mission, world.state);
  for (const command of world.pendingCommands()) sim.enqueue(command);
  const fromTick = sim.state.tick;
  const tracks = new Map<string, ForesightTrack>();
  const sample = () => {
    for (const op of sim.state.operatives) {
      if (op.status !== 'active' && op.status !== 'downed' && !tracks.has(op.id)) continue;
      let track = tracks.get(op.id);
      if (!track) tracks.set(op.id, (track = { id: op.id, kind: 'operative', role: op.role, points: [], moves: false }));
      track.points.push({ x: op.pos.x, z: op.pos.z });
    }
    for (const g of sim.state.guards) {
      if (g.status !== 'active' && !tracks.has(g.id)) continue;
      let track = tracks.get(g.id);
      if (!track) tracks.set(g.id, (track = { id: g.id, kind: 'guard', role: null, points: [], moves: false }));
      track.points.push({ x: g.pos.x, z: g.pos.z });
    }
  };
  sample();

  const incidents: ForesightIncident[] = [];
  const noticed = new Set<string>();
  let spotted: ForesightIncident | null = null;
  const at = () => (sim.state.tick - fromTick) / TICK_RATE;
  const guardPos = (id: string): Vec2 | null => {
    const g = sim.guard(id);
    return g ? { ...g.pos } : null;
  };
  const opPos = (id: string): Vec2 => {
    const op = sim.operative(id);
    return op ? { ...op.pos } : { x: 0, z: 0 };
  };

  const squadCentre = (): Vec2 => {
    const active = sim.state.operatives.filter((op) => op.status === 'active');
    if (active.length === 0) return { x: 0, z: 0 };
    return { x: active.reduce((s, op) => s + op.pos.x, 0) / active.length, z: active.reduce((s, op) => s + op.pos.z, 0) / active.length };
  };

  const total = Math.round(seconds * TICK_RATE);
  for (let i = 0; i < total && sim.state.status === 'running' && !spotted; i += 1) {
    const events = sim.step();
    for (const e of events) {
      if (e.type === 'detected' && sim.operative(e.targetId)) {
        spotted = { kind: 'spotted', seconds: at(), pos: opPos(e.targetId), guardId: e.guardId, from: guardPos(e.guardId), text: `${callSign(sim, e.targetId)} spotted` };
        incidents.push(spotted);
      } else if (e.type === 'bark' && e.line === 'guard-found-body') {
        incidents.push({ kind: 'body-found', seconds: at(), pos: guardPos(e.speaker) ?? { x: 0, z: 0 }, guardId: e.speaker, from: null, text: 'A body is found' });
      } else if (e.type === 'operative-status' && (e.status === 'downed' || e.status === 'dead' || e.status === 'captured')) {
        incidents.push({ kind: 'casualty', seconds: at(), pos: opPos(e.unitId), guardId: null, from: null, text: `${callSign(sim, e.unitId)} ${e.status === 'downed' ? 'down' : e.status}` });
      } else if (e.type === 'objective' && e.status === 'completed') {
        const title = sim.mission.objectives.find((o) => o.id === e.id)?.title ?? 'Objective';
        incidents.push({ kind: 'objective', seconds: at(), pos: squadCentre(), guardId: null, from: null, text: `${title}: done` });
      } else if (e.type === 'alarm' && e.level > e.previous) {
        incidents.push({ kind: e.level >= 3 ? 'alarm' : 'unrest', seconds: at(), pos: squadCentre(), guardId: null, from: null, text: `Alarm: ${ALARM_LABELS[e.level]}` });
      }
    }
    // A sentry starting to size someone up is the warning before a sighting: once per pair.
    for (const g of sim.state.guards) {
      if (g.status !== 'active') continue;
      for (const entry of g.suspicion) {
        const key = `${g.id}>${entry.targetId}`;
        if (entry.value < THRESHOLD.suspicious || noticed.has(key) || !sim.operative(entry.targetId)) continue;
        noticed.add(key);
        incidents.push({ kind: 'noticed', seconds: at(), pos: opPos(entry.targetId), guardId: g.id, from: { ...g.pos }, text: `A sentry eyes ${callSign(sim, entry.targetId)}` });
      }
    }
    if ((i + 1) % FORESIGHT_SAMPLE_TICKS === 0 || spotted) sample();
  }

  for (const track of tracks.values()) {
    const first = track.points[0]!;
    track.moves = track.points.some((p) => Math.hypot(p.x - first.x, p.z - first.z) > STILL_METRES);
  }
  return { fromTick, seconds: at(), tracks: [...tracks.values()], incidents, spotted };
}

/** Where a track stands `t` seconds into the forecast (holding its last point after the end). */
export function trackAt(track: ForesightTrack, t: number): Vec2 {
  const points = track.points;
  const f = Math.max(0, (t * TICK_RATE) / FORESIGHT_SAMPLE_TICKS);
  const i = Math.min(points.length - 1, Math.floor(f));
  const a = points[i]!;
  const b = points[Math.min(points.length - 1, i + 1)]!;
  const k = i === points.length - 1 ? 0 : f - i;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
}

/** The one-line verdict shown while paused. */
export function verdict(f: Forecast): { tone: 'clear' | 'warning' | 'danger'; text: string } {
  if (f.spotted) return { tone: 'danger', text: `${f.spotted.text} in ${f.spotted.seconds.toFixed(1)} s` };
  const casualty = f.incidents.find((i) => i.kind === 'casualty' || i.kind === 'alarm' || i.kind === 'body-found');
  if (casualty) return { tone: 'danger', text: `${casualty.text} in ${casualty.seconds.toFixed(1)} s` };
  const warning = f.incidents.find((i) => i.kind === 'noticed' || i.kind === 'unrest');
  if (warning) return { tone: 'warning', text: `${warning.text} in ${warning.seconds.toFixed(1)} s` };
  return { tone: 'clear', text: `Next ${Math.round(f.seconds)} s: nobody sees the squad` };
}
