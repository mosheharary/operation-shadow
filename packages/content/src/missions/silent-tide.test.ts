import { describe, expect, it } from 'vitest';
import { levelHash, stateHash, validateMission, World, type MissionRuntime } from '@operation-shadow/engine';
import { runUntil } from '@operation-shadow/engine/testing';
import { buildSilentTide, SILENT_TIDE } from './silent-tide';

describe('Silent Tide', () => {
  const { level, mission } = buildSilentTide();

  it('advertises the same squad rules the built mission enforces', () => {
    expect(SILENT_TIDE.squad.required).toEqual(mission.requiredRoles);
    expect([SILENT_TIDE.squad.min, SILENT_TIDE.squad.max]).toEqual([mission.squadSize.min, mission.squadSize.max]);
  });

  it('generates the same level every time', () => {
    const started = Date.now();
    const again = buildSilentTide();
    const ms = Date.now() - started;
    expect(levelHash(again.level)).toBe(levelHash(level));
    expect(ms).toBeLessThan(5000);
  });

  it('passes mission validation with a stealth route to the primary objective', () => {
    const report = validateMission(level, mission);
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
    expect(report.stats.stealthRouteMetres).not.toBeNull();
    expect(report.stats.guards).toBe(23);
  });

  it('a full alert where nobody is found clears to Routine 30 s later and stays clear', () => {
    const world = World.create(level, mission, { seed: 42, squad: ['engineer', 'infiltrator', 'recon', 'marine'], difficulty: 'standard' });
    for (const op of world.state.operatives) op.stance = 'prone';
    for (let i = 0; i < 20 * 20; i++) world.step();
    // The beach sentry is shot at from the landing point; the squad lies still in the dark.
    world.alertGuardTo(world.guard('g:beach')!, 'op:recon', { ...world.operative('op:recon')!.pos });
    for (let i = 0; i < 20 * 5; i++) world.step();
    expect(world.state.alarm.level).toBe(4);
    for (let i = 0; i < 20 * 30; i++) world.step();
    expect(world.state.alarm.level).toBe(0);
    expect(world.state.log.at(-1)?.text).toMatch(/^All clear/);
    for (let i = 0; i < 20 * 40; i++) world.step();
    expect(world.state.alarm.level).toBe(0);
    expect(world.state.operatives.every((op) => op.status === 'active')).toBe(true);
  });

  it('can be completed through every objective (guards removed to test the objective chain)', () => {
    const quiet: MissionRuntime = { ...mission, guards: [], reinforcementSpawns: [], director: mission.director };
    const world = World.create(level, quiet, { seed: 1, squad: ['engineer', 'infiltrator', 'recon', 'marine'], difficulty: 'standard' });

    expect(world.enqueue({ type: 'ability', unitId: 'op:engineer', abilityId: 'sabotage', target: { kind: 'entity', id: 'target:fire-control-radio' }, gait: 'run' }).ok).toBe(true);
    expect(world.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'pick-up', target: { kind: 'entity', id: 'item:codebook' }, gait: 'run' }).ok).toBe(true);
    expect(runUntil(world, (w) => w.state.objectives.find((o) => o.id === 'obj:radio')?.status === 'completed', 240)).toBe(true);
    expect(runUntil(world, (w) => w.state.objectives.find((o) => o.id === 'obj:codebook')?.status === 'completed', 120)).toBe(true);
    // The scout objective is revealed by the director at 150 seconds.
    expect(runUntil(world, (w) => w.state.objectives.find((o) => o.id === 'obj:scout')?.status === 'active', 200)).toBe(true);

    expect(world.enqueue({ type: 'ability', unitId: 'op:engineer', abilityId: 'lockpick', target: { kind: 'entity', id: 'door:holding:0' }, gait: 'run' }).ok).toBe(true);
    expect(runUntil(world, (w) => w.object('door:holding:0')?.type === 'door' && !(w.object('door:holding:0') as { locked: boolean }).locked, 120)).toBe(true);
    expect(world.enqueue({ type: 'ability', unitId: 'op:engineer', abilityId: 'free', target: { kind: 'entity', id: 'prisoner:scout' } }).ok).toBe(true);
    expect(runUntil(world, (w) => (w.object('prisoner:scout') as { freed?: boolean }).freed === true, 30)).toBe(true);

    world.enqueue({ type: 'move', unitIds: ['op:engineer', 'op:infiltrator', 'op:recon', 'op:marine'], target: { x: 12, z: 18.5 }, gait: 'run' });
    expect(runUntil(world, (w) => w.state.status !== 'running', 180)).toBe(true);
    expect(world.state.status).toBe('success');
    expect(world.state.objectives.map((o) => o.status)).toEqual(['completed', 'completed', 'completed']);
  });

  it('runs the full guarded mission deterministically without errors', () => {
    const run = () => {
      const world = World.create(level, mission, { seed: 42, squad: ['engineer', 'infiltrator', 'recon', 'marine'], difficulty: 'standard' });
      for (let i = 0; i < 20 * 60; i += 1) world.step();
      return world;
    };
    const a = run();
    const b = run();
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    // A squad waiting quietly at the landing point is not discovered in the first minute.
    expect(a.state.stats.detections).toBe(0);
    expect(a.state.status).toBe('running');
  });
});
