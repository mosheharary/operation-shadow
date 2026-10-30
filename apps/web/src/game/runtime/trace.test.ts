import { type GameEvent, TICK_RATE, vec, type World } from '@operation-shadow/engine';
import { buildTestLevel, makeMission, makeWorld } from '@operation-shadow/engine/testing';
import { describe, expect, it } from 'vitest';
import {
  alarmAt,
  CHART_ASPECT,
  chartView,
  MissionTrace,
  positionAt,
  QUIET_WEIGHT,
  replayAtTick,
  replayPace,
  replaySeconds,
  routeLength,
  SPOTTED_GAP_TICKS,
  tickAtReplay,
  TRACE_INTERVAL_TICKS,
  type TraceRoute,
} from './trace';

function setup(): World {
  const level = buildTestLevel({}, (b) => b.addZone({ id: 'extraction', kind: 'extraction', min: vec(0, 34), max: vec(6, 40) }));
  return makeWorld(level, makeMission(level, {}), ['infiltrator', 'engineer']);
}

/** Steps the world the way the controller does, noting each tick (and any extra events) on the trace. */
function play(world: World, trace: MissionTrace, ticks: number, extra: GameEvent[] = []): void {
  for (let i = 0; i < ticks; i += 1) trace.observe([...world.step(), ...(i === 0 ? extra : [])], world);
}

const route = (points: [number, number, number][]): TraceRoute => ({ id: 'op:x', role: 'infiltrator', points: points.map(([tick, x, z]) => ({ tick, x, z })) });

describe('mission trace', () => {
  it('starts with everyone where they stand and adds a point only when someone has moved', () => {
    const world = setup();
    const trace = new MissionTrace();
    trace.begin(world);
    expect(trace.routes.map((r) => r.points.length)).toEqual([1, 1]);
    play(world, trace, TRACE_INTERVAL_TICKS * 3);
    expect(trace.routes.map((r) => r.points.length)).toEqual([1, 1]);
    const op = world.operative('op:infiltrator')!;
    op.pos = vec(op.pos.x + 4, op.pos.z);
    play(world, trace, TRACE_INTERVAL_TICKS);
    expect(trace.routes[0]!.points).toHaveLength(2);
    expect(trace.routes[0]!.points[1]!.x).toBeCloseTo(op.pos.x);
    expect(trace.routes[1]!.points).toHaveLength(1);
  });

  it('stamps incidents where they happened, a sighting once while it keeps happening, and follows the alarm', () => {
    const world = setup();
    const trace = new MissionTrace();
    trace.begin(world);
    const spotted: GameEvent = { type: 'detected', guardId: 'g1', targetId: 'op:infiltrator' };
    play(world, trace, 1, [spotted, { ...spotted, guardId: 'g2' }, { type: 'alarm', level: 2, previous: 0, reason: 'seen' }]);
    play(world, trace, 1, [spotted]);
    expect(trace.incidents.map((i) => [i.kind, i.text])).toEqual([['spotted', 'MOTH spotted']]);
    expect(trace.incidents[0]!.pos).toEqual(world.operative('op:infiltrator')!.pos);
    play(world, trace, SPOTTED_GAP_TICKS);
    play(world, trace, 1, [spotted, { type: 'operative-status', unitId: 'op:engineer', status: 'downed' }, { type: 'footstep', unitId: 'op:engineer', pos: vec(1, 1), surface: 0, db: 30 }]);
    expect(trace.incidents.map((i) => i.text)).toEqual(['MOTH spotted', 'MOTH spotted', 'BADGER down']);
    expect(trace.alarm.map((a) => a.level)).toEqual([0, 2]);
    expect(alarmAt(trace.alarm, 0)).toBe(0);
    expect(alarmAt(trace.alarm, 1)).toBe(2);
  });

  it('forgets what came after a moment the field recorder wound back to', () => {
    const world = setup();
    const trace = new MissionTrace();
    trace.begin(world);
    const op = world.operative('op:infiltrator')!;
    for (let i = 0; i < 4; i += 1) {
      op.pos = vec(op.pos.x + 2, op.pos.z);
      play(world, trace, TRACE_INTERVAL_TICKS, [{ type: 'detected', guardId: 'g1', targetId: 'op:infiltrator' }, { type: 'alarm', level: 1, previous: 0, reason: '' }]);
    }
    trace.cut(TRACE_INTERVAL_TICKS * 2);
    expect(trace.routes[0]!.points.every((p) => p.tick <= TRACE_INTERVAL_TICKS * 2)).toBe(true);
    expect(trace.incidents.every((i) => i.tick <= TRACE_INTERVAL_TICKS * 2)).toBe(true);
    expect(trace.alarm[0]!.tick).toBe(0);
  });
});

describe('reading a route', () => {
  const r = route([
    [0, 0, 0],
    [20, 10, 0],
    [40, 10, 10],
  ]);

  it('places a squad member between the points either side of a moment', () => {
    expect(positionAt(r, -5)).toEqual({ x: 0, z: 0 });
    expect(positionAt(r, 10)).toEqual({ x: 5, z: 0 });
    expect(positionAt(r, 30)).toEqual({ x: 10, z: 5 });
    expect(positionAt(r, 99)).toEqual({ x: 10, z: 10 });
    expect(positionAt(route([]), 0)).toBeNull();
  });

  it('measures the ground covered up to a moment', () => {
    expect(routeLength(r)).toBe(20);
    expect(routeLength(r, 10)).toBe(5);
    expect(routeLength(r, 30)).toBe(15);
  });
});

describe('chart framing', () => {
  const map = { width: 200, depth: 120 };

  it('frames the action padded and in the chart shape, at least a street wide', () => {
    const view = chartView([vec(50, 50), vec(60, 55)], map);
    expect(view.width / view.depth).toBeCloseTo(CHART_ASPECT);
    expect(view.width).toBeGreaterThanOrEqual(56);
    expect(view.x).toBeLessThan(50);
    expect(view.x + view.width).toBeGreaterThan(60);
    expect(view.z).toBeLessThan(50);
    expect(view.z + view.depth).toBeGreaterThan(55);
  });

  it('stays on the map and shows all of it when there is nothing to frame', () => {
    const corner = chartView([vec(2, 2)], map);
    expect(corner.x).toBe(0);
    expect(corner.z).toBe(0);
    const wide = chartView([vec(0, 0), vec(200, 120)], map);
    expect(wide).toEqual({ x: 0, z: 0, width: 200, depth: 120 });
    expect(chartView([], map)).toEqual({ x: 0, z: 0, width: 200, depth: 120 });
  });
});

describe('replay pace', () => {
  // Ten seconds: someone moves in the first two, then nothing until a sighting at 9 s.
  const trace = {
    startTick: 0,
    routes: [route([[0, 0, 0], [TICK_RATE, 2, 0], [2 * TICK_RATE, 4, 0]])],
    incidents: [{ tick: 9 * TICK_RATE + 5, kind: 'spotted' as const, pos: vec(4, 0), text: 'MOTH spotted' }],
    alarm: [{ tick: 0, level: 0 as const }],
  };
  const end = 10 * TICK_RATE;

  it('plays quiet seconds faster than busy ones', () => {
    const { pace, weighted } = replayPace(trace, end);
    expect(pace[0]).toBe(0);
    expect(pace.at(-1)).toBe(1);
    // Busy: 0-1 s (moves) and 7-9 s (around the sighting); the rest is quiet.
    expect(weighted).toBeCloseTo(5 + 5 * QUIET_WEIGHT);
    const quiet = pace[5]! - pace[4]!;
    const busy = pace[1]! - pace[0]!;
    expect(quiet / busy).toBeCloseTo(QUIET_WEIGHT);
  });

  it('maps replay progress to mission time and back', () => {
    const { pace } = replayPace(trace, end);
    expect(tickAtReplay(pace, 0, end, 0)).toBe(0);
    expect(tickAtReplay(pace, 0, end, 1)).toBe(end);
    for (const tick of [0, 13, 70, 150, 199]) expect(tickAtReplay(pace, 0, end, replayAtTick(pace, 0, end, tick))).toBeCloseTo(tick);
    expect(replayAtTick(pace, 0, end, end)).toBe(1);
  });

  it('takes a few seconds, a little longer for an eventful attempt, never long', () => {
    expect(replaySeconds(10)).toBe(5);
    expect(replaySeconds(600)).toBeGreaterThan(replaySeconds(120));
    expect(replaySeconds(10_000)).toBe(12);
  });
});
