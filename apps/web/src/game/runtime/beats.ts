import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { ALARM_LABELS, type GameEvent, type Vec2, type World } from '@operation-shadow/engine';
import { objectivePos } from './trace';

/**
 * Turning points: the few moments in a mission that decide it (a sentry dropped, the squad
 * spotted, a man down, an objective done) land with weight instead of passing as a toast. The
 * clock dips into slow motion for a breath and eases back, and the HUD slams an ink stamp onto the
 * spot where it happened. Only the clock's pace changes, never the simulation, so play stays
 * deterministic. Pure logic: contains no React or three.js.
 */

export type BeatKind = 'out-cold' | 'killed' | 'spotted' | 'alarm' | 'down' | 'lost' | 'objective' | 'failed' | 'extract';
export type BeatTone = 'quiet' | 'good' | 'warning' | 'danger';

export interface Beat {
  id: number;
  kind: BeatKind;
  /** Where the stamp lands, or null for a moment that belongs to the whole field (the alarm). */
  pos: Vec2 | null;
  title: string;
  detail: string;
  tone: BeatTone;
  /** Real time it began (ms, performance.now()). */
  at: number;
}

interface BeatStyle {
  tone: BeatTone;
  /** A moment of a higher rank cuts across a lower one still showing; never the other way round. */
  rank: number;
  /** Slowest pace the clock dips to (1 = real time). */
  slow: number;
  /** Real seconds held at that pace, then eased back over `recover`. */
  hold: number;
  recover: number;
  /** Real seconds the stamp stays up. */
  show: number;
  /** The same kind is not repeated within this many real seconds. */
  cooldown: number;
}

export const BEAT_STYLES: Record<BeatKind, BeatStyle> = {
  'out-cold': { tone: 'quiet', rank: 1, slow: 0.35, hold: 0.12, recover: 0.4, show: 1.5, cooldown: 0 },
  killed: { tone: 'warning', rank: 1, slow: 0.35, hold: 0.12, recover: 0.4, show: 1.5, cooldown: 0 },
  spotted: { tone: 'danger', rank: 3, slow: 0.2, hold: 0.35, recover: 0.7, show: 2.2, cooldown: 6 },
  alarm: { tone: 'danger', rank: 4, slow: 0.25, hold: 0.3, recover: 0.7, show: 2.4, cooldown: 10 },
  down: { tone: 'danger', rank: 4, slow: 0.2, hold: 0.4, recover: 0.8, show: 2.6, cooldown: 0 },
  lost: { tone: 'danger', rank: 4, slow: 0.2, hold: 0.4, recover: 0.8, show: 2.6, cooldown: 0 },
  objective: { tone: 'good', rank: 5, slow: 0.25, hold: 0.4, recover: 0.9, show: 3, cooldown: 0 },
  failed: { tone: 'danger', rank: 5, slow: 0.25, hold: 0.4, recover: 0.9, show: 3, cooldown: 0 },
  extract: { tone: 'good', rank: 6, slow: 0.25, hold: 0.45, recover: 0.9, show: 3.6, cooldown: 0 },
};

/** Real seconds the clock takes to drop into slow motion. */
const DIP_SECONDS = 0.08;

/** The clock's pace a given real time into a beat: a quick dip, a held breath, a smooth return. */
export function beatTimeScale(kind: BeatKind, elapsed: number): number {
  const { slow, hold, recover } = BEAT_STYLES[kind];
  if (elapsed <= 0) return 1;
  if (elapsed < DIP_SECONDS) return 1 + (slow - 1) * (elapsed / DIP_SECONDS);
  if (elapsed < DIP_SECONDS + hold) return slow;
  const t = (elapsed - DIP_SECONDS - hold) / recover;
  if (t >= 1) return 1;
  return slow + (1 - slow) * t * t * (3 - 2 * t);
}

type Moment = Omit<Beat, 'id' | 'at' | 'tone'>;

const GUARD_NAMES = { soldier: 'Sentry', nco: 'Sergeant', officer: 'Officer' } as const;

/** The middle of the extraction zone, where the squad is sent once the work is done. */
function extractionPos(world: World): Vec2 | null {
  const zone = world.level.zones.find((z) => z.id === world.mission.extractionZoneId);
  return zone ? { x: (zone.min.x + zone.max.x) / 2, z: (zone.min.z + zone.max.z) / 2 } : null;
}

/** True once every required objective is completed (extraction is then the only thing left). */
function requiredDone(world: World): boolean {
  return world.mission.objectives.filter((d) => d.required).every((d) => world.state.objectives.find((o) => o.id === d.id)?.status === 'completed');
}

/** The turning point an event marks, or null for everyday events. */
export function momentFor(e: GameEvent, world: World): Moment | null {
  const operative = (id: string) => {
    const op = world.operative(id);
    return op ? { name: SPECIALIST_PROFILES[op.role].callSign, pos: { ...op.pos } } : null;
  };
  switch (e.type) {
    case 'guard-status': {
      const guard = world.guard(e.guardId);
      if (!guard) return null;
      const who = GUARD_NAMES[guard.rank];
      if (e.status === 'ko') return { kind: 'out-cold', pos: { ...guard.pos }, title: 'Out cold', detail: `${who} down without a sound` };
      if (e.status === 'dead') return { kind: 'killed', pos: { ...guard.pos }, title: 'Neutralised', detail: `${who} killed` };
      return null;
    }
    case 'detected': {
      const op = operative(e.targetId);
      const guard = world.guard(e.guardId);
      if (!op) return null;
      return { kind: 'spotted', pos: op.pos, title: 'Spotted', detail: guard ? `${op.name}, seen by a ${GUARD_NAMES[guard.rank].toLowerCase()}` : `${op.name} has been seen` };
    }
    case 'alarm':
      if (e.level < 3 || e.previous >= 3) return null;
      return { kind: 'alarm', pos: null, title: 'Alarm', detail: ALARM_LABELS[e.level] };
    case 'operative-status': {
      const op = operative(e.unitId);
      if (!op) return null;
      if (e.status === 'downed') return { kind: 'down', pos: op.pos, title: 'Man down', detail: `${op.name} needs a medic` };
      if (e.status === 'dead') return { kind: 'lost', pos: op.pos, title: 'Killed in action', detail: op.name };
      if (e.status === 'captured') return { kind: 'lost', pos: op.pos, title: 'Captured', detail: `${op.name} taken prisoner` };
      return null;
    }
    case 'objective': {
      const def = world.mission.objectives.find((d) => d.id === e.id);
      if (!def) return null;
      if (e.status === 'failed') return { kind: 'failed', pos: objectivePos(world, e.id), title: 'Objective lost', detail: def.title };
      if (e.status !== 'completed') return null;
      // The last required objective sends the squad home: the stamp lands on the way out.
      if (def.required && requiredDone(world)) return { kind: 'extract', pos: extractionPos(world), title: 'Now extract', detail: `${def.title}: done` };
      return { kind: 'objective', pos: objectivePos(world, e.id), title: 'Objective complete', detail: def.title };
    }
    default:
      return null;
  }
}

/**
 * Picks the turning points out of the event stream and keeps the one on screen. A moment cuts
 * across a lesser one still showing (an objective over a takedown), a lesser one waits its turn by
 * being dropped, and the noisy kinds (spotted, alarm) have a cooldown so a firefight is one beat,
 * not twenty.
 */
export class BeatDirector {
  /** Off: no slow motion and no stamps (a setting). */
  enabled = true;
  current: Beat | null = null;
  private nextId = 1;
  private readonly lastByKind = new Map<BeatKind, number>();
  private readonly listeners = new Set<(beat: Beat) => void>();

  onBeat(listener: (beat: Beat) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Looks for a turning point in one tick's events. `now` is real time in ms. */
  observe(events: GameEvent[], world: World, now: number): Beat | null {
    if (!this.enabled || world.state.status !== 'running') return null;
    let best: Moment | null = null;
    for (const e of events) {
      const moment = momentFor(e, world);
      if (moment && (!best || BEAT_STYLES[moment.kind].rank > BEAT_STYLES[best.kind].rank)) best = moment;
    }
    if (!best) return null;
    const style = BEAT_STYLES[best.kind];
    const last = this.lastByKind.get(best.kind);
    if (last !== undefined && now - last < style.cooldown * 1000) return null;
    const showing = this.showing(now);
    if (showing && BEAT_STYLES[showing.kind].rank > style.rank) return null;
    const beat: Beat = { ...best, id: this.nextId++, tone: style.tone, at: now };
    this.current = beat;
    this.lastByKind.set(beat.kind, now);
    for (const listener of this.listeners) listener(beat);
    return beat;
  }

  /** Switching turning points off also lifts the one on screen. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.clear();
  }

  /** The beat whose stamp is still up, if any. */
  showing(now: number): Beat | null {
    const beat = this.current;
    if (!beat || now - beat.at > BEAT_STYLES[beat.kind].show * 1000) return null;
    return beat;
  }

  /** The clock's pace right now (1 outside a beat). */
  scale(now: number): number {
    const beat = this.current;
    if (!beat || !this.enabled) return 1;
    return beatTimeScale(beat.kind, (now - beat.at) / 1000);
  }

  /** Forgets the moment on screen (restart, load, winding back). */
  clear(): void {
    this.current = null;
    this.lastByKind.clear();
  }
}

/**
 * Where the stamp sits on screen this frame. The scene (which owns the camera) writes it every frame
 * and the HUD reads it on its own animation frame, so neither re-renders React for it. `edge` is
 * set when the spot is out of view: the stamp then waits on the screen edge, pointing at it.
 */
export const beatFrame: { x: number; y: number; edge: boolean; angle: number } = { x: 0, y: 0, edge: false, angle: 0 };
