import { stateHash, validateMission, World } from '@operation-shadow/engine';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../index';

describe.each(CAMPAIGN.map((m) => [m.key, m] as const))('mission %s', (_key, entry) => {
  const { level, mission } = entry.build();

  it('passes validation with a stealth route to the primary objective', () => {
    const report = validateMission(level, mission);
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.stats.stealthRouteMetres).not.toBeNull();
  });

  it('advertises the squad rules the built mission enforces', () => {
    expect([...entry.squad.required].sort()).toEqual([...mission.requiredRoles].sort());
    expect(entry.squad.min).toBe(mission.squadSize.min);
    expect(entry.squad.max).toBe(mission.squadSize.max);
  });

  it('runs a guarded minute deterministically with a quiet squad left unseen', () => {
    const squad = [...new Set([...entry.squad.required, 'infiltrator', 'engineer', 'recon', 'medic'] as const)].slice(0, entry.squad.max);
    const run = () => {
      const world = World.create(level, mission, { seed: 3, squad: [...squad], difficulty: 'standard' });
      for (let i = 0; i < 20 * 60; i += 1) world.step();
      return world;
    };
    const a = run();
    expect(stateHash(a.state)).toBe(stateHash(run().state));
    expect(a.state.stats.detections).toBe(0);
    expect(a.state.status).toBe('running');
  });
});
