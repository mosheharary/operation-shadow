import { BOOT_CAMP } from '@operation-shadow/content';
import { type Vec2, World } from '@operation-shadow/engine';
import { runUntil } from '@operation-shadow/engine/testing';
import { describe, expect, it } from 'vitest';
import { resolveContextAction } from '../input/context-action';
import { advanceTutorial, DRILL_MARKER, FENCE_MARKER, GRASS_MARKER, MOVE_MARKER, type TutorialContext, TUTORIAL_STEPS } from './script';

/** Plays Boot Camp the way the tutorial tells a new player to, using the real right-click logic. */
describe('Boot Camp tutorial', () => {
  it('can be followed from the first step to the end without being spotted', () => {
    const { level, mission } = BOOT_CAMP.build();
    const world = World.create(level, mission, { seed: 7, squad: ['infiltrator', 'engineer'], difficulty: 'standard' });
    const used = new Set<TutorialContext['used'] extends ReadonlySet<infer T> ? T : never>();
    let selected: string[] = [];
    let step = 1; // past "welcome" (a Continue button)
    const ctx = (): TutorialContext => ({ world, selected, used });
    const stepId = () => TUTORIAL_STEPS[step]!.id;
    const advance = () => {
      step = advanceTutorial(TUTORIAL_STEPS, step, ctx());
    };
    const rightClick = (units: string[], hover: { kind: 'guard' | 'object' | 'operative'; id: string } | null, ground: Vec2 | null, gait: 'walk' | 'run' = 'walk') => {
      const action = resolveContextAction(world, units, hover, ground, { gait });
      expect(action.kind, JSON.stringify(action)).not.toBe('blocked');
      if (action.kind === 'move' || action.kind === 'ability') expect(world.enqueue(action.command).ok).toBe(true);
    };

    selected = ['op:infiltrator'];
    advance();
    expect(stepId()).toBe('move');
    rightClick(selected, null, MOVE_MARKER);
    expect(runUntil(world, () => (advance(), stepId() === 'camera'), 30)).toBe(true);
    used.add('pan').add('zoom');
    advance();
    selected = ['op:infiltrator', 'op:engineer'];
    advance();
    used.add('cones');
    advance();
    expect(stepId()).toBe('crouch');

    selected = ['op:infiltrator'];
    world.enqueue({ type: 'stance', unitIds: selected, stance: 'crouch' });
    rightClick(selected, null, GRASS_MARKER);
    expect(runUntil(world, () => (advance(), stepId() === 'takedown'), 60)).toBe(true);

    rightClick(selected, null, DRILL_MARKER);
    world.step();
    runUntil(world, () => world.operative('op:infiltrator')!.action === null, 30);
    rightClick(selected, { kind: 'guard', id: 'g:drill' }, null);
    expect(runUntil(world, () => (advance(), stepId() === 'tie'), 20)).toBe(true);
    rightClick(selected, { kind: 'guard', id: 'g:drill' }, null);
    expect(runUntil(world, () => (advance(), stepId() === 'hide'), 20)).toBe(true);
    rightClick(selected, { kind: 'guard', id: 'g:drill' }, null); // carry
    runUntil(world, () => world.operative('op:infiltrator')!.carrying !== null, 20);
    rightClick(selected, { kind: 'object', id: 'container:drill-crate' }, null);
    expect(runUntil(world, () => (advance(), stepId() === 'lockpick'), 40)).toBe(true);

    selected = ['op:engineer'];
    rightClick(selected, { kind: 'object', id: 'door:armory:0' }, null, 'run');
    expect(runUntil(world, () => (advance(), stepId() === 'steal'), 90)).toBe(true);
    rightClick(selected, { kind: 'object', id: 'item:papers' }, null);
    expect(runUntil(world, () => (advance(), stepId() === 'fence'), 40)).toBe(true);

    rightClick(selected, { kind: 'object', id: 'fence:east' }, FENCE_MARKER);
    expect(runUntil(world, () => (advance(), stepId() === 'regroup'), 60)).toBe(true);
    // MOTH skirts west of the armory, away from the gate.
    rightClick(['op:infiltrator'], null, { x: 44, z: 43.5 });
    world.step();
    runUntil(world, () => world.operative('op:infiltrator')!.action === null, 60);
    rightClick(['op:infiltrator'], null, { x: 57.5, z: 43.5 });
    expect(runUntil(world, () => (advance(), stepId() === 'extract'), 60)).toBe(true);
    world.enqueue({ type: 'move', unitIds: ['op:infiltrator', 'op:engineer'], target: { x: 66.5, z: 41 }, gait: 'walk' });
    expect(runUntil(world, () => (advance(), stepId() === 'finished'), 120)).toBe(true);
    expect(world.state.outcome?.message).toBe('Mission complete: the squad has extracted');
    expect(world.state.stats.detections).toBe(0);
  });
});
