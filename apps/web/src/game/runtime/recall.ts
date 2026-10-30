import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { ALARM_LABELS, type GameEvent, type SimState, TICK_RATE, type World } from '@operation-shadow/engine';

/** Something that happened on the tape, shown on the frame it follows. */
export interface RecallMark {
  tick: number;
  kind: 'danger' | 'warning' | 'success';
  text: string;
}

/** One frame of the field recorder: the whole simulation as it stood, and what happened next. */
export interface RecallFrame {
  tick: number;
  state: SimState;
  /** Events between this frame and the next one. */
  marks: RecallMark[];
}

/** A frame every two seconds of mission time... */
export const RECALL_INTERVAL_TICKS = 2 * TICK_RATE;
/** ...for the last minute. */
export const RECALL_FRAMES = 30;

/** The mark an event leaves on the tape, or null for the everyday ones (footsteps, barks, doors). */
export function markFor(e: GameEvent, world: World): Omit<RecallMark, 'tick'> | null {
  const callSign = (id: string) => {
    const op = world.operative(id);
    return op ? SPECIALIST_PROFILES[op.role].callSign : null;
  };
  switch (e.type) {
    case 'detected': {
      const name = callSign(e.targetId);
      return name ? { kind: 'danger', text: `${name} spotted` } : null;
    }
    case 'alarm':
      return e.level > e.previous ? { kind: e.level >= 3 ? 'danger' : 'warning', text: `Alarm: ${ALARM_LABELS[e.level]}` } : null;
    case 'operative-status': {
      const name = callSign(e.unitId);
      if (!name) return null;
      if (e.status === 'downed') return { kind: 'danger', text: `${name} down` };
      if (e.status === 'captured') return { kind: 'danger', text: `${name} captured` };
      if (e.status === 'dead') return { kind: 'danger', text: `${name} killed` };
      return null;
    }
    case 'objective':
      if (e.status === 'completed') return { kind: 'success', text: 'Objective complete' };
      if (e.status === 'failed') return { kind: 'danger', text: 'Objective failed' };
      return null;
    case 'mission':
      return e.status === 'failed' ? { kind: 'danger', text: 'Mission failed' } : null;
    default:
      return null;
  }
}

/**
 * The field recorder: a rolling minute of simulation snapshots, so a mistake can be wound back
 * and played differently. Each frame carries the trouble that followed it, which is how the
 * recall knows where to open. Contains no React.
 */
export class RecallTape {
  frames: RecallFrame[] = [];

  /** Takes a frame when the interval has passed since the last one (call after every tick). */
  record(world: World): void {
    const last = this.frames[this.frames.length - 1];
    const { tick } = world.state;
    if (last && tick - last.tick < RECALL_INTERVAL_TICKS && tick >= last.tick) return;
    this.frames.push({ tick, state: world.snapshot(), marks: [] });
    if (this.frames.length > RECALL_FRAMES) this.frames.splice(0, this.frames.length - RECALL_FRAMES);
  }

  /** Notes the events that matter on the newest frame. */
  observe(events: GameEvent[], world: World): void {
    const last = this.frames[this.frames.length - 1];
    if (!last) return;
    for (const e of events) {
      const mark = markFor(e, world);
      if (mark && !last.marks.some((m) => m.text === mark.text)) last.marks.push({ ...mark, tick: world.state.tick });
    }
  }

  /** Winding back to a frame erases everything taped after it. */
  cut(index: number): void {
    this.frames = this.frames.slice(0, index + 1);
    const frame = this.frames[index];
    if (frame) frame.marks = [];
  }

  clear(): void {
    this.frames = [];
  }
}

/** Frames of calm that end a run of trouble: closer troubles count as the same mess. */
const CALM_FRAMES = 5;

/**
 * The frame a recall opens on: just before the latest run of trouble began (the first sighting,
 * not the casualty it led to), or a few seconds back when nothing has gone wrong.
 */
export function openingFrame(frames: readonly RecallFrame[]): number {
  if (frames.length === 0) return -1;
  const troubled = (i: number) => frames[i]!.marks.some((m) => m.kind !== 'success');
  let start = -1;
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    if (!troubled(i)) continue;
    if (start >= 0 && start - i > CALM_FRAMES) break;
    start = i;
  }
  if (start < 0) return Math.max(0, frames.length - 2);
  return Math.max(0, start - 1);
}

/** What the player is about to undo by resuming from a frame: the trouble taped after it. */
export function undoneMarks(frames: readonly RecallFrame[], index: number): RecallMark[] {
  const seen = new Set<string>();
  return frames
    .slice(index)
    .flatMap((f) => f.marks)
    .filter((m) => !seen.has(m.text) && seen.add(m.text));
}
