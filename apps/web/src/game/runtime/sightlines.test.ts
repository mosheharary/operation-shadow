import { type Guard, type Operative, THRESHOLD } from '@operation-shadow/engine';
import { describe, expect, it } from 'vitest';
import { dangerLevel, edgeMarker, heartbeatInterval, SIGHT_GRACE_TICKS, sightlines, stageFor, watchByOperative } from './sightlines';

const guard = (id: string, entries: { targetId: string; value: number; lastSeenTick: number }[], status: Guard['status'] = 'active') =>
  ({ id, status, suspicion: entries.map((e) => ({ ...e, lastSeen: { x: 0, z: 0 } })) }) as unknown as Guard;
const op = (id: string, status: Operative['status'] = 'active') => ({ id, status }) as unknown as Operative;

describe('sightlines', () => {
  it('stages follow the guard thresholds', () => {
    expect(stageFor(THRESHOLD.observe)).toBe('watch');
    expect(stageFor(THRESHOLD.suspicious)).toBe('suspect');
    expect(stageFor(THRESHOLD.investigate)).toBe('close');
    expect(stageFor(THRESHOLD.detected)).toBe('seen');
  });

  it('lists active watchers above the observe threshold, strongest first', () => {
    const lines = sightlines({
      tick: 100,
      operatives: [op('op:a'), op('op:b'), op('op:c', 'captured')],
      guards: [
        guard('g:1', [
          { targetId: 'op:a', value: 30, lastSeenTick: 100 },
          { targetId: 'op:b', value: THRESHOLD.observe - 1, lastSeenTick: 100 },
          { targetId: 'op:c', value: 90, lastSeenTick: 100 },
        ]),
        guard('g:2', [{ targetId: 'op:b', value: 80, lastSeenTick: 100 - SIGHT_GRACE_TICKS - 1 }]),
        guard('g:3', [{ targetId: 'op:a', value: 99, lastSeenTick: 100 }], 'ko'),
      ],
    });
    expect(lines.map((l) => [l.guardId, l.targetId])).toEqual([
      ['g:2', 'op:b'],
      ['g:1', 'op:a'],
    ]);
    expect(lines[0]).toMatchObject({ stage: 'close', seeing: false, level: 0.8 });
    expect(lines[1]).toMatchObject({ stage: 'watch', seeing: true, level: 0.3 });
  });

  it('danger counts only watchers who still see, and the heartbeat starts at suspicion', () => {
    const lines = sightlines({
      tick: 50,
      operatives: [op('op:a'), op('op:b')],
      guards: [guard('g:1', [{ targetId: 'op:a', value: 90, lastSeenTick: 0 }]), guard('g:2', [{ targetId: 'op:b', value: 50, lastSeenTick: 50 }])],
    });
    expect(dangerLevel(lines)).toBeCloseTo(0.5);
    expect(dangerLevel([])).toBe(0);
    expect(watchByOperative(lines).get('op:a')?.guardId).toBe('g:1');
    expect(heartbeatInterval(0.3)).toBeNull();
    const slow = heartbeatInterval(0.5)!;
    const fast = heartbeatInterval(0.99)!;
    expect(fast).toBeLessThan(slow);
    expect(fast).toBeGreaterThan(0.4);
  });

  it('puts off-screen watchers on the edge in their direction, and leaves on-screen ones alone', () => {
    const inset = { side: 40, top: 100, bottom: 60 };
    expect(edgeMarker(0.2, -0.3, false, 1000, 600, inset)).toBeNull();
    const right = edgeMarker(3, 0, false, 1000, 600, inset)!;
    expect(right.x).toBeCloseTo(960);
    expect(right.y).toBeCloseTo(320);
    expect(right.angle).toBeCloseTo(0);
    const top = edgeMarker(0, 2, false, 1000, 600, inset)!;
    expect(top.x).toBeCloseTo(500);
    expect(top.y).toBeCloseTo(100);
    expect(top.angle).toBeCloseTo(-Math.PI / 2);
    // Behind the camera the projection is mirrored, so a point "ahead and left" is really behind and right.
    const behind = edgeMarker(-0.1, 0, true, 1000, 600, inset)!;
    expect(behind.x).toBeCloseTo(960);
  });
});
