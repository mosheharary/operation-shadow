import { getMission } from '@operation-shadow/content';
import { stateHash, TICK_RATE, vec, type Vec2, World } from '@operation-shadow/engine';
import { buildTestLevel, makeMission, makeWorld } from '@operation-shadow/engine/testing';
import { describe, expect, it } from 'vitest';
import { FORESIGHT_SAMPLE_TICKS, FORESIGHT_SECONDS, forecast, trackAt, verdict } from './foresight';

const WEST = Math.PI;

function level() {
  return buildTestLevel({ width: 40, depth: 40 }, (b) => b.addZone({ id: 'extraction', kind: 'extraction', min: vec(0, 34), max: vec(6, 40) }));
}

/** One sentry on a post at (30, 20) looking west, the infiltrator well behind him. */
function setup(): World {
  const lvl = level();
  const guard = { id: 'g:1', archetype: 'rifleman' as const, rank: 'soldier' as const, temperament: 'standard' as const, sector: 'main', pos: vec(30, 20), facing: WEST };
  const world = makeWorld(lvl, makeMission(lvl, { guards: [guard] }), ['infiltrator']);
  const op = world.operative('op:infiltrator')!;
  op.pos = vec(36, 20);
  op.stance = 'crouch';
  return world;
}

const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

describe('foresight', () => {
  it('runs ahead on a copy and leaves the real world exactly as it was', () => {
    const world = setup();
    const before = stateHash(world.state);
    const f = forecast(world);
    expect(stateHash(world.state)).toBe(before);
    expect(f.fromTick).toBe(world.state.tick);
    expect(f.seconds).toBe(FORESIGHT_SECONDS);
    expect(f.spotted).toBeNull();
    const op = f.tracks.find((t) => t.id === 'op:infiltrator')!;
    expect(op.points).toHaveLength((FORESIGHT_SECONDS * TICK_RATE) / FORESIGHT_SAMPLE_TICKS + 1);
    expect(op.moves).toBe(false);
    expect(f.tracks.find((t) => t.id === 'g:1')!.kind).toBe('guard');
    expect(verdict(f)).toEqual({ tone: 'clear', text: 'Next 10 s: nobody sees the squad' });
  });

  it('follows orders given during the pause and matches what then really happens', () => {
    const world = setup();
    expect(world.enqueue({ type: 'move', unitIds: ['op:infiltrator'], target: vec(36, 30), gait: 'walk' }).ok).toBe(true);
    const f = forecast(world, 4);
    const track = f.tracks.find((t) => t.id === 'op:infiltrator')!;
    expect(track.moves).toBe(true);
    // The world is deterministic: playing on lands exactly where the forecast said.
    for (let i = 0; i < 4 * TICK_RATE; i += 1) world.step();
    expect(near(trackAt(track, 4), world.operative('op:infiltrator')!.pos)).toBeLessThan(1e-6);
    expect(near(trackAt(track, 99), trackAt(track, 4))).toBe(0);
  });

  it('warns before a sighting and stops at it', () => {
    const world = setup();
    world.enqueue({ type: 'move', unitIds: ['op:infiltrator'], target: vec(14, 20), gait: 'walk' });
    world.enqueue({ type: 'stance', unitIds: ['op:infiltrator'], stance: 'stand' });
    const f = forecast(world);
    expect(f.spotted).not.toBeNull();
    expect(f.spotted!.text).toBe('MOTH spotted');
    expect(f.spotted!.guardId).toBe('g:1');
    expect(f.seconds).toBeCloseTo(f.spotted!.seconds);
    expect(f.seconds).toBeLessThan(FORESIGHT_SECONDS);
    const noticed = f.incidents.find((i) => i.kind === 'noticed');
    expect(noticed && noticed.seconds <= f.spotted!.seconds).toBe(true);
    expect(verdict(f).tone).toBe('danger');
    expect(verdict(f).text).toMatch(/^MOTH spotted in \d+\.\d s$/);
  });

  it('is quick enough to run when the game is paused on a full mission', () => {
    const built = getMission('silent-tide')!.build();
    const world = World.create(built.level, built.mission, { seed: 42, squad: ['engineer', 'infiltrator', 'recon', 'marine'], difficulty: 'standard' });
    const started = performance.now();
    const f = forecast(world);
    // Generous for a slow CI machine; it is typically a few tens of milliseconds.
    expect(performance.now() - started).toBeLessThan(1500);
    expect(f.tracks.filter((t) => t.kind === 'guard' && t.moves).length).toBeGreaterThan(0);
  });
});
