import { type GameEvent, vec, World } from '@operation-shadow/engine';
import { buildTestLevel, makeMission, makeWorld, runFor } from '@operation-shadow/engine/testing';
import { describe, expect, it } from 'vitest';
import { markFor, openingFrame, RECALL_FRAMES, RECALL_INTERVAL_TICKS, type RecallFrame, RecallTape, undoneMarks } from './recall';

function setup(): World {
  const level = buildTestLevel({}, (b) => b.addZone({ id: 'extraction', kind: 'extraction', min: vec(0, 34), max: vec(6, 40) }));
  return makeWorld(level, makeMission(level, {}), ['infiltrator', 'engineer']);
}

/** Steps the world the way the controller does: events noted, then a frame taken when due. */
function play(world: World, tape: RecallTape, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    const events = world.step();
    tape.observe(events, world);
    tape.record(world);
  }
}

const frame = (tick: number, kinds: ('danger' | 'warning' | 'success')[] = []): RecallFrame => ({
  tick,
  state: null as never,
  marks: kinds.map((kind, i) => ({ tick: tick + 1, kind, text: `${kind} ${tick} ${i}` })),
});

describe('field recorder tape', () => {
  it('takes a frame every interval and keeps only the last minute', () => {
    const world = setup();
    const tape = new RecallTape();
    tape.record(world);
    play(world, tape, RECALL_INTERVAL_TICKS * 3);
    expect(tape.frames.map((f) => f.tick)).toEqual([0, 1, 2, 3].map((n) => n * RECALL_INTERVAL_TICKS));
    play(world, tape, RECALL_INTERVAL_TICKS * (RECALL_FRAMES + 5));
    expect(tape.frames).toHaveLength(RECALL_FRAMES);
    expect(tape.frames.at(-1)!.tick).toBe(world.state.tick);
  });

  it('frames are copies: playing on does not change what was taped', () => {
    const world = setup();
    const tape = new RecallTape();
    tape.record(world);
    world.operative('op:infiltrator')!.pos = vec(30, 30);
    runFor(world, 1);
    expect(tape.frames[0]!.state.operatives[0]!.pos).not.toEqual(vec(30, 30));
  });

  it('winding back restores the world, and cutting erases the frames after it', () => {
    const world = setup();
    const tape = new RecallTape();
    tape.record(world);
    play(world, tape, RECALL_INTERVAL_TICKS * 4);
    const back = World.restore(world.level, world.mission, tape.frames[1]!.state);
    expect(back.state.tick).toBe(RECALL_INTERVAL_TICKS);
    tape.cut(1);
    expect(tape.frames).toHaveLength(2);
    // Recording carries on from the restored frame.
    play(back, tape, RECALL_INTERVAL_TICKS);
    expect(tape.frames.map((f) => f.tick)).toEqual([0, 1, 2].map((n) => n * RECALL_INTERVAL_TICKS));
  });

  it('marks sightings, rising alarms, casualties and objectives with call-signs, once per frame', () => {
    const world = setup();
    const tape = new RecallTape();
    tape.record(world);
    const events: GameEvent[] = [
      { type: 'detected', guardId: 'g1', targetId: 'op:infiltrator' },
      { type: 'detected', guardId: 'g2', targetId: 'op:infiltrator' },
      { type: 'alarm', level: 3, previous: 1, reason: 'shots' },
      { type: 'alarm', level: 1, previous: 2, reason: 'calm' },
      { type: 'operative-status', unitId: 'op:engineer', status: 'downed' },
      { type: 'footstep', unitId: 'op:engineer', pos: vec(1, 1), surface: 0, db: 30 },
    ];
    tape.observe(events, world);
    expect(tape.frames[0]!.marks.map((m) => [m.kind, m.text])).toEqual([
      ['danger', 'MOTH spotted'],
      ['danger', 'Alarm: Sector alert'],
      ['danger', 'BADGER down'],
    ]);
    expect(markFor({ type: 'objective', id: 'o', status: 'completed' }, world)?.kind).toBe('success');
  });
});

describe('opening frame', () => {
  it('opens a few seconds back when nothing has gone wrong', () => {
    expect(openingFrame([frame(0), frame(40), frame(80)])).toBe(1);
    expect(openingFrame([frame(0)])).toBe(0);
    expect(openingFrame([])).toBe(-1);
  });

  it('opens just before the latest run of trouble began, not on the casualty it led to', () => {
    const frames = [frame(0), frame(40, ['warning']), frame(80), frame(120), frame(160), frame(200), frame(240), frame(280), frame(320, ['danger']), frame(360), frame(400, ['danger']), frame(440)];
    // The early warning is more than five calm frames before the later mess, so it is its own.
    expect(openingFrame(frames)).toBe(7);
    // A success is not trouble.
    expect(openingFrame([frame(0), frame(40), frame(80, ['success']), frame(120)])).toBe(2);
  });

  it('lists what resuming would undo, each only once', () => {
    const frames = [frame(0), frame(40, ['danger']), frame(80)];
    frames[2]!.marks.push({ ...frames[1]!.marks[0]! });
    expect(undoneMarks(frames, 1).map((m) => m.text)).toEqual(['danger 40 0']);
    expect(undoneMarks(frames, 2)).toHaveLength(1);
  });
});
