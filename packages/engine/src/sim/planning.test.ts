import { describe, expect, it } from 'vitest';
import { compileMission, fallbackSpec } from '../missions/compile';
import { COASTAL_TEMPLATE } from '../missions/templates/index';
import { World } from './world';

const setup = () => {
  const { level, mission } = compileMission(fallbackSpec(COASTAL_TEMPLATE, 12, 'planning'), COASTAL_TEMPLATE);
  return World.create(level, mission, { seed: 3, squad: ['engineer', 'infiltrator', 'recon'], difficulty: 'standard' });
};
const steps = (world: World, n: number) => {
  for (let i = 0; i < n; i += 1) world.step();
};
const near = (world: World, id: string) => {
  const op = world.operative(id)!;
  return { x: op.pos.x + 4, z: op.pos.z };
};

describe('planning mode', () => {
  it('held orders wait for the signal, then everyone moves on the same tick', () => {
    const world = setup();
    const ids = ['op:engineer', 'op:infiltrator'];
    expect(world.enqueue({ type: 'hold', unitIds: ids }).ok).toBe(true);
    for (const id of ids) world.enqueue({ type: 'move', unitIds: [id], target: near(world, id), gait: 'walk', queue: true });
    const before = ids.map((id) => ({ ...world.operative(id)!.pos }));
    steps(world, 40);
    ids.forEach((id, i) => expect(world.operative(id)!.pos).toEqual(before[i]));
    expect(world.operative('op:engineer')!.action?.kind).toBe('wait-signal');

    world.enqueue({ type: 'signal' });
    steps(world, 2);
    for (const id of ids) expect(world.operative(id)!.action?.kind).toBe('move');
    steps(world, 60);
    ids.forEach((id, i) => expect(Math.hypot(world.operative(id)!.pos.x - before[i]!.x, world.operative(id)!.pos.z - before[i]!.z)).toBeGreaterThan(2));
  });

  it('a later hold in the same queue waits for the next signal', () => {
    const world = setup();
    const id = 'op:recon';
    world.enqueue({ type: 'hold', unitIds: [id] });
    world.enqueue({ type: 'move', unitIds: [id], target: near(world, id), gait: 'walk', queue: true });
    world.enqueue({ type: 'hold', unitIds: [id], queue: true });
    world.enqueue({ type: 'signal' });
    steps(world, 200);
    expect(world.operative(id)!.action?.kind).toBe('wait-signal');
  });

  it('"abort if spotted" drops the plan when a guard spots the operative', () => {
    const world = setup();
    const id = 'op:infiltrator';
    world.enqueue({ type: 'abort-rule', unitIds: [id], rule: 'spotted' });
    world.enqueue({ type: 'hold', unitIds: [id] });
    world.enqueue({ type: 'move', unitIds: [id], target: near(world, id), gait: 'walk', queue: true });
    steps(world, 2);
    expect(world.operative(id)!.queue.length).toBe(1);
    world.operative(id)!.lastSpottedTick = world.state.tick + 1;
    steps(world, 2);
    const op = world.operative(id)!;
    expect(op.action).toBeNull();
    expect(op.queue).toEqual([]);
    expect(world.state.log.some((l) => l.text.includes('aborted the plan'))).toBe(true);
  });

  it('"abort on alarm" fires only when the alarm rises after the rule was set', () => {
    const world = setup();
    const id = 'op:engineer';
    world.enqueue({ type: 'abort-rule', unitIds: [id], rule: 'alarm' });
    world.enqueue({ type: 'hold', unitIds: [id] });
    steps(world, 3);
    expect(world.operative(id)!.action?.kind).toBe('wait-signal');
    world.raiseAlarm(2, 'test', 'village', world.operative(id)!.pos);
    steps(world, 2);
    expect(world.operative(id)!.action).toBeNull();
  });

  it('a held plan survives save and load', () => {
    const world = setup();
    world.enqueue({ type: 'hold', unitIds: ['op:engineer'] });
    world.enqueue({ type: 'move', unitIds: ['op:engineer'], target: near(world, 'op:engineer'), gait: 'walk', queue: true });
    steps(world, 5);
    const copy = World.restore(world.level, world.mission, world.snapshot());
    for (const w of [world, copy]) {
      w.enqueue({ type: 'signal' });
      steps(w, 50);
    }
    expect(copy.operative('op:engineer')!.pos).toEqual(world.operative('op:engineer')!.pos);
  });
});
