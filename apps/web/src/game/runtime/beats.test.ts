import { type GameEvent, vec, type World } from '@operation-shadow/engine';
import { buildTestLevel, makeMission, makeWorld } from '@operation-shadow/engine/testing';
import { describe, expect, it } from 'vitest';
import { BEAT_STYLES, BeatDirector, beatTimeScale, momentFor } from './beats';

function setup(): World {
  const level = buildTestLevel({}, (b) => b.addZone({ id: 'extraction', kind: 'extraction', min: vec(0, 34), max: vec(6, 40) }));
  const mission = makeMission(level, {
    guards: [{ id: 'g:1', archetype: 'rifleman', rank: 'nco', temperament: 'standard', sector: 'main', pos: vec(20, 20), facing: 0 }],
    objects: [
      { type: 'objective-target', id: 'radio', pos: vec(30, 30), label: 'Radio', sector: 'main' },
      { type: 'objective-target', id: 'mast', pos: vec(10, 30), label: 'Mast', sector: 'main' },
    ],
    objectives: [
      { id: 'radio', kind: 'disable-target', targetId: 'radio', required: true, title: 'Disable the radio', description: '' },
      { id: 'mast', kind: 'disable-target', targetId: 'mast', required: false, title: 'Topple the mast', description: '' },
    ],
  });
  return makeWorld(level, mission, ['infiltrator', 'engineer']);
}

const complete = (world: World, id: string): GameEvent => {
  world.state.objectives.find((o) => o.id === id)!.status = 'completed';
  return { type: 'objective', id, status: 'completed' };
};

describe('turning points', () => {
  it('dips the clock quickly, holds the breath and eases back to real time', () => {
    const { slow, hold, recover } = BEAT_STYLES.spotted;
    expect(beatTimeScale('spotted', 0)).toBe(1);
    expect(beatTimeScale('spotted', 0.04)).toBeLessThan(1);
    expect(beatTimeScale('spotted', 0.08 + hold / 2)).toBe(slow);
    const easing = [0.25, 0.5, 0.75].map((f) => beatTimeScale('spotted', 0.08 + hold + recover * f));
    expect(easing[0]).toBeGreaterThan(slow);
    expect(easing[1]).toBeGreaterThan(easing[0]!);
    expect(easing[2]).toBeLessThan(1);
    expect(beatTimeScale('spotted', 0.08 + hold + recover)).toBe(1);
    expect(beatTimeScale('spotted', 10)).toBe(1);
  });

  it('names each decisive moment and puts it where it happened', () => {
    const world = setup();
    const moth = world.operative('op:infiltrator')!;
    expect(momentFor({ type: 'detected', guardId: 'g:1', targetId: 'op:infiltrator' }, world)).toMatchObject({ kind: 'spotted', title: 'Spotted', detail: 'MOTH, seen by a sergeant', pos: moth.pos });
    expect(momentFor({ type: 'guard-status', guardId: 'g:1', status: 'ko' }, world)).toMatchObject({ kind: 'out-cold', pos: { x: 20, z: 20 } });
    expect(momentFor({ type: 'guard-status', guardId: 'g:1', status: 'dead' }, world)).toMatchObject({ kind: 'killed' });
    expect(momentFor({ type: 'operative-status', unitId: 'op:engineer', status: 'downed' }, world)).toMatchObject({ kind: 'down', detail: 'BADGER needs a medic' });
    expect(momentFor({ type: 'alarm', level: 3, previous: 2, reason: '' }, world)).toMatchObject({ kind: 'alarm', pos: null, detail: 'Sector alert' });
    // Everyday events are not turning points.
    expect(momentFor({ type: 'alarm', level: 2, previous: 1, reason: '' }, world)).toBeNull();
    expect(momentFor({ type: 'guard-status', guardId: 'g:1', status: 'active' }, world)).toBeNull();
    expect(momentFor({ type: 'footstep', unitId: 'op:engineer', pos: vec(1, 1), surface: 0, db: 30 }, world)).toBeNull();
  });

  it('stamps an objective on its target, and the last required one sends the squad to the extraction', () => {
    const world = setup();
    expect(momentFor(complete(world, 'mast'), world)).toMatchObject({ kind: 'objective', title: 'Objective complete', detail: 'Topple the mast', pos: { x: 10, z: 30 } });
    expect(momentFor(complete(world, 'radio'), world)).toMatchObject({ kind: 'extract', title: 'Now extract', detail: 'Disable the radio: done', pos: { x: 3, z: 37 } });
  });

  it('keeps the weightier moment, drops a lesser one while it shows, and does not repeat a sighting', () => {
    const world = setup();
    const director = new BeatDirector();
    const spotted: GameEvent = { type: 'detected', guardId: 'g:1', targetId: 'op:infiltrator' };
    // Two in one tick: the casualty outranks the sighting.
    expect(director.observe([spotted, { type: 'operative-status', unitId: 'op:engineer', status: 'downed' }], world, 1000)?.kind).toBe('down');
    expect(director.scale(1000 + 200)).toBeLessThan(1);
    // A takedown while the casualty is still up is dropped; an objective cuts across it.
    expect(director.observe([{ type: 'guard-status', guardId: 'g:1', status: 'ko' }], world, 1500)).toBeNull();
    expect(director.observe([complete(world, 'mast')], world, 1600)?.kind).toBe('objective');
    expect(director.showing(1600 + BEAT_STYLES.objective.show * 1000 + 1)).toBeNull();
    expect(director.scale(20_000)).toBe(1);
    // A sighting is not stamped again within its cooldown.
    expect(director.observe([spotted], world, 20_000)?.kind).toBe('spotted');
    expect(director.observe([spotted], world, 23_000)).toBeNull();
    expect(director.observe([spotted], world, 20_000 + BEAT_STYLES.spotted.cooldown * 1000 + 1)?.kind).toBe('spotted');
  });

  it('stays out of the way when switched off, after the mission ends and once cleared', () => {
    const world = setup();
    const director = new BeatDirector();
    const spotted: GameEvent = { type: 'detected', guardId: 'g:1', targetId: 'op:infiltrator' };
    director.enabled = false;
    expect(director.observe([spotted], world, 1000)).toBeNull();
    expect(director.scale(1100)).toBe(1);
    director.enabled = true;
    director.observe([spotted], world, 2000);
    director.clear();
    expect(director.showing(2100)).toBeNull();
    expect(director.scale(2100)).toBe(1);
    world.state.status = 'failed';
    expect(director.observe([spotted], world, 3000)).toBeNull();
  });
});
