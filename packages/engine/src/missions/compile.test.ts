import { describe, expect, it } from 'vitest';
import { levelHash } from '../levelgen/hash';
import type { MissionRuntime } from '../sim/mission';
import type { SpecialistId } from '../sim/types';
import { stateHash } from '../sim/snapshot';
import { World } from '../sim/world';
import { runUntil } from '../testing/scenario';
import { compileAndValidate, compileMission, fallbackSpec, specIssues } from './compile';
import { MISSION_SPEC_VERSION, type MissionSpec, type TemplateDef } from './spec';
import { ALPINE_TEMPLATE, COASTAL_TEMPLATE, RAIL_TEMPLATE, TRAINING_TEMPLATE } from './templates/index';

const SQUAD: SpecialistId[] = ['engineer', 'infiltrator', 'recon', 'marine'];

/** Every objective the template offers, in one spec (one per slot). */
function everySlotSpec(template: TemplateDef, seed: number): MissionSpec {
  const kinds = { 'objective-target': 'sabotage', item: 'steal', prisoner: 'rescue' } as const;
  return {
    version: MISSION_SPEC_VERSION,
    id: `${template.id}-all`,
    title: 'All slots',
    templateId: template.id,
    seed,
    env: { timeOfDay: template.defaults.timeOfDay, weather: template.defaults.weather },
    density: 'heavy',
    objectives: template.slots.map((s, i) => ({
      id: `o${i}`,
      kind: kinds[s.tag as keyof typeof kinds],
      slot: s.id,
      title: s.label,
      description: s.label,
      required: i === 0,
    })),
    squad: { required: [], min: 1, max: 4 },
    failAtAlarm: null,
    parSeconds: 900,
    events: [],
  };
}

/** Plays the objective chain with guards removed: pick locks, do each objective, extract. */
function playChain(level: ReturnType<typeof compileMission>['level'], mission: MissionRuntime, squad: SpecialistId[]): World {
  const quiet: MissionRuntime = { ...mission, guards: [], reinforcementSpawns: [], director: [] };
  const world = World.create(level, quiet, { seed: 1, squad, difficulty: 'standard' });
  const has = (role: SpecialistId) => squad.includes(role);
  for (const obj of world.state.objects) {
    if (obj.type !== 'door' || !obj.locked || !has('engineer')) continue;
    if (!world.enqueue({ type: 'ability', unitId: 'op:engineer', abilityId: 'lockpick', target: { kind: 'entity', id: obj.id }, gait: 'run' }).ok) continue;
    runUntil(world, (w) => w.object(obj.id)?.type === 'door' && !(w.object(obj.id) as { locked: boolean }).locked, 240);
  }
  for (const def of mission.objectives) {
    const done = (w: World) => w.state.objectives.find((o) => o.id === def.id)?.status === 'completed';
    if (def.kind === 'disable-target') {
      expect(world.enqueue({ type: 'ability', unitId: 'op:engineer', abilityId: 'sabotage', target: { kind: 'entity', id: def.targetId }, gait: 'run' }), def.id).toMatchObject({ ok: true });
      expect(runUntil(world, done, 300), def.id).toBe(true);
    } else if (def.kind === 'acquire-item') {
      const unit = has('infiltrator') ? 'op:infiltrator' : `op:${squad[0]}`;
      expect(world.enqueue({ type: 'ability', unitId: unit, abilityId: 'pick-up', target: { kind: 'entity', id: def.itemObjectId }, gait: 'run' }), def.id).toMatchObject({ ok: true });
      expect(runUntil(world, done, 300), def.id).toBe(true);
    } else if (def.kind === 'rescue') {
      const unit = has('infiltrator') ? 'op:infiltrator' : `op:${squad[0]}`;
      expect(world.enqueue({ type: 'ability', unitId: unit, abilityId: 'free', target: { kind: 'entity', id: def.prisonerId }, gait: 'run' }), def.id).toMatchObject({ ok: true });
      expect(runUntil(world, (w) => (w.object(def.prisonerId) as { freed?: boolean }).freed === true, 300), def.id).toBe(true);
    }
  }
  const zone = level.zones.find((z) => z.id === mission.extractionZoneId)!;
  const centre = { x: (zone.min.x + zone.max.x) / 2, z: (zone.min.z + zone.max.z) / 2 };
  world.enqueue({ type: 'move', unitIds: squad.map((r) => `op:${r}`), target: centre, gait: 'run' });
  runUntil(world, (w) => w.state.status !== 'running', 400);
  return world;
}

describe.each([COASTAL_TEMPLATE, ALPINE_TEMPLATE, RAIL_TEMPLATE])('template $name', (template) => {
  it('generates the same level for the same seed', () => {
    expect(levelHash(template.generate(7, 'a'))).toBe(levelHash(template.generate(7, 'a')));
  });

  it('offers every slot it advertises', () => {
    const level = template.generate(3, 'slots');
    for (const s of template.slots) expect(level.slots.some((l) => l.id === `slot:${s.id}`), s.id).toBe(true);
    expect(level.slots.filter((s) => s.tags.includes('insertion')).length).toBeGreaterThanOrEqual(4);
  });

  it.each([11, 2026, 90210])('compiles a valid offline-generated mission (seed %i)', (seed) => {
    const spec = fallbackSpec(template, seed, `fallback-${seed}`);
    expect(specIssues(spec, template)).toEqual([]);
    const { report } = compileAndValidate(spec, template);
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.stats.stealthRouteMetres).not.toBeNull();
  });

  it('can complete every objective slot and extract (guards removed)', () => {
    const { level, mission, report } = compileAndValidate(everySlotSpec(template, 5), template);
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const world = playChain(level, mission, SQUAD);
    expect(world.state.status).toBe('success');
    expect(world.state.objectives.every((o) => o.status === 'completed')).toBe(true);
  });
});

describe('training ground', () => {
  it('compiles the tutorial layout and can be finished by the Infiltrator and Engineer', () => {
    const spec: MissionSpec = {
      ...everySlotSpec(TRAINING_TEMPLATE, 1),
      density: 'light',
      squad: { required: ['infiltrator', 'engineer'], min: 2, max: 2 },
    };
    const { level, mission, report } = compileAndValidate(spec, TRAINING_TEMPLATE);
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.stats.stealthRouteMetres).not.toBeNull();
    expect(playChain(level, mission, ['infiltrator', 'engineer']).state.status).toBe('success');
  });
});

describe('spec checks', () => {
  it('rejects unknown slots, wrong slot kinds and missing primaries', () => {
    const spec = fallbackSpec(COASTAL_TEMPLATE, 1, 'x');
    expect(specIssues({ ...spec, objectives: [{ ...spec.objectives[0]!, slot: 'nowhere' }] }, COASTAL_TEMPLATE).join()).toMatch(/unknown slot/);
    expect(specIssues({ ...spec, objectives: [{ ...spec.objectives[0]!, kind: 'steal', slot: 'gun-1' }] }, COASTAL_TEMPLATE).join()).toMatch(/does not support/);
    expect(specIssues({ ...spec, objectives: spec.objectives.map((o) => ({ ...o, required: false })) }, COASTAL_TEMPLATE).join()).toMatch(/required/);
    expect(() => compileMission({ ...spec, templateId: 'alpine-ridge' }, COASTAL_TEMPLATE)).toThrow(/Invalid mission spec/);
  });

  it('adds the Combat Engineer when a required objective needs sabotage', () => {
    const spec = fallbackSpec(RAIL_TEMPLATE, 4, 'x');
    const { mission } = compileMission({ ...spec, events: [], squad: { required: [], min: 1, max: 4 }, objectives: [{ id: 'p', kind: 'sabotage', slot: 'ammo-train', title: 't', description: 'd', required: true }] }, RAIL_TEMPLATE);
    expect(mission.requiredRoles).toContain('engineer');
  });
});

describe('dynamic-event deck', () => {
  const run = (squadFar: boolean, difficulty: 'standard' | 'veteran' = 'standard', seed = 5) => {
    const spec = { ...fallbackSpec(RAIL_TEMPLATE, 31, 'deck-test'), dynamicEvents: true };
    const { level, mission } = compileMission(spec, RAIL_TEMPLATE);
    const world = World.create(level, mission, { seed, squad: ['engineer', 'infiltrator', 'recon'], difficulty });
    // Keep the squad still (and hidden by distance or not): stand them on a reinforcement point.
    if (!squadFar) for (const op of world.state.operatives) op.pos = { ...RAIL_TEMPLATE.reinforcements[0]!.pos };
    const messages: string[] = [];
    for (let i = 0; i < 20 * 900; i += 1) for (const e of world.step()) if (e.type === 'message') messages.push(e.text);
    return { world, messages };
  };

  it('plays patrols, weather and intel within the difficulty budget, deterministically', () => {
    const a = run(true);
    const b = run(true);
    expect(stateHash(a.world.state)).toBe(stateHash(b.world.state));
    const deck = a.world.state.director.deck!;
    expect(deck.drawn).toBeGreaterThanOrEqual(3);
    const runs = [1, 2, 3, 4, 5, 6].map((seed) => run(true, 'standard', seed));
    for (const r of runs) expect(r.world.state.director.deck!.complications).toBeLessThanOrEqual(2);
    const all = runs.flatMap((r) => r.messages);
    expect(all.some((m) => m.includes('patrol is sweeping'))).toBe(true);
    expect(all.some((m) => /Rain|Fog|sky/.test(m))).toBe(true);
    expect(run(true, 'veteran').world.state.director.deck!.complications).toBeLessThanOrEqual(3);
  });

  it('never spawns a patrol next to the squad', () => {
    const { messages } = run(false);
    expect(messages.filter((m) => m.includes(`sweeping the ${RAIL_TEMPLATE.reinforcements[0]!.sector}`))).toEqual([]);
  });

  it('is absent from campaign missions without the flag', () => {
    const { level, mission } = compileMission(fallbackSpec(RAIL_TEMPLATE, 31, 'no-deck'), RAIL_TEMPLATE);
    expect(mission.deck).toBeUndefined();
    expect(World.create(level, mission, { seed: 5, squad: ['engineer', 'infiltrator'], difficulty: 'standard' }).state.director.deck).toBeUndefined();
  });
});
