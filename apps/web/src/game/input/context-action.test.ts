import { type GuardSpawn, type ObjectSpawn, type SpecialistId, vec, type World } from '@operation-shadow/engine';
import { buildTestLevel, makeMission, makeWorld } from '@operation-shadow/engine/testing';
import { describe, expect, it } from 'vitest';
import { abilityBar, resolveAbilityOrder, resolveContextAction } from './context-action';

const EAST = 0;
const WEST = Math.PI;

function setup(squad: SpecialistId[], options: { guards?: GuardSpawn[]; objects?: ObjectSpawn[] } = {}): World {
  const level = buildTestLevel({}, (b) => b.addZone({ id: 'extraction', kind: 'extraction', min: vec(0, 34), max: vec(6, 40) }));
  return makeWorld(level, makeMission(level, options), squad);
}

function guardAt(id: string, x: number, z: number, facing: number): GuardSpawn {
  return { id, archetype: 'rifleman', rank: 'soldier', temperament: 'standard', sector: 'main', pos: vec(x, z), facing };
}

function place(world: World, role: SpecialistId, x: number, z: number) {
  const op = world.operative(`op:${role}`)!;
  op.pos = vec(x, z);
  return op;
}

describe('resolveContextAction', () => {
  it('moves every selected squad member to empty ground', () => {
    const world = setup(['infiltrator', 'engineer']);
    const action = resolveContextAction(world, ['op:infiltrator', 'op:engineer'], null, vec(20, 20));
    expect(action.kind).toBe('move');
    if (action.kind === 'move') expect(action.command.unitIds).toEqual(['op:infiltrator', 'op:engineer']);
  });

  it('runs on request and leaves unavailable squad members out', () => {
    const world = setup(['infiltrator', 'engineer']);
    world.operative('op:engineer')!.status = 'downed';
    const action = resolveContextAction(world, ['op:infiltrator', 'op:engineer'], null, vec(20, 20), { gait: 'run' });
    expect(action.kind === 'move' && action.command.gait).toBe('run');
    expect(action.kind === 'move' && action.command.unitIds).toEqual(['op:infiltrator']);
  });

  it('knocks out a guard from behind but explains why it cannot from the front', () => {
    const world = setup(['infiltrator'], { guards: [guardAt('g:1', 20, 20, EAST)] });
    place(world, 'infiltrator', 16, 20);
    const behind = resolveContextAction(world, ['op:infiltrator'], { kind: 'guard', id: 'g:1' }, null);
    expect(behind.kind === 'ability' && behind.command.abilityId).toBe('takedown');

    world.guard('g:1')!.facing = WEST;
    const front = resolveContextAction(world, ['op:infiltrator'], { kind: 'guard', id: 'g:1' }, null);
    expect(front.kind).toBe('blocked');
    if (front.kind === 'blocked') expect(front.message).toMatch(/behind/i);
  });

  it('never picks a lethal ability on its own', () => {
    const world = setup(['marine'], { guards: [guardAt('g:1', 20, 20, EAST)] });
    place(world, 'marine', 16, 20);
    const action = resolveContextAction(world, ['op:marine'], { kind: 'guard', id: 'g:1' }, null);
    expect(action.kind).toBe('blocked');
  });

  it('hands an entity to the first selected specialist who can act on it', () => {
    const world = setup(['infiltrator', 'engineer'], { objects: [{ type: 'door', id: 'door:1', pos: vec(20.5, 20.5), locked: true }] });
    const onlyMoth = resolveContextAction(world, ['op:infiltrator'], { kind: 'object', id: 'door:1' }, null);
    expect(onlyMoth.kind).toBe('blocked');
    if (onlyMoth.kind === 'blocked') expect(onlyMoth.message).toMatch(/Combat Engineer/);

    const both = resolveContextAction(world, ['op:infiltrator', 'op:engineer'], { kind: 'object', id: 'door:1' }, null);
    expect(both.kind === 'ability' && both.command).toMatchObject({ unitId: 'op:engineer', abilityId: 'lockpick' });
  });

  it('ties up an unconscious guard when possible, otherwise carries him', () => {
    const world = setup(['infiltrator', 'recon'], { guards: [guardAt('g:1', 20, 20, EAST)] });
    const g = world.guard('g:1')!;
    g.status = 'ko';
    g.koUntil = 10_000;
    const moth = resolveContextAction(world, ['op:infiltrator'], { kind: 'guard', id: 'g:1' }, null);
    expect(moth.kind === 'ability' && moth.command.abilityId).toBe('restrain');
    const owl = resolveContextAction(world, ['op:recon'], { kind: 'guard', id: 'g:1' }, null);
    expect(owl.kind === 'ability' && owl.command.abilityId).toBe('carry');
  });

  it('revives a downed ally with the medic', () => {
    const world = setup(['medic', 'recon']);
    world.operative('op:recon')!.status = 'downed';
    const action = resolveContextAction(world, ['op:medic'], { kind: 'operative', id: 'op:recon' }, null);
    expect(action.kind === 'ability' && action.command.abilityId).toBe('revive');
  });

  it('right-clicking OWL with an empty suppressed rifle resupplies it from a teammate\'s spare rounds', () => {
    const world = setup(['marine', 'recon']);
    const owl = world.operative('op:recon')!;
    place(world, 'marine', 10, 10);
    place(world, 'recon', 11, 10);
    expect(resolveContextAction(world, ['op:marine'], { kind: 'operative', id: 'op:recon' }, vec(11, 10)).kind).toBe('move');
    owl.inventory['rifle-round'] = 0;
    const action = resolveContextAction(world, ['op:marine'], { kind: 'operative', id: 'op:recon' }, vec(11, 10));
    expect(action.kind === 'ability' && action.command.abilityId).toBe('resupply');
    if (action.kind === 'ability') expect(world.enqueue(action.command).ok).toBe(true);
    for (let i = 0; i < 20 * 4; i++) world.step();
    expect(owl.inventory['rifle-round']).toBe(2);
  });

  it('the spy chats up an active guard instead of attacking him', () => {
    const world = setup(['spy'], { guards: [guardAt('g:1', 20, 20, EAST)] });
    place(world, 'spy', 19, 20);
    const action = resolveContextAction(world, ['op:spy'], { kind: 'guard', id: 'g:1' }, null);
    expect(action.kind === 'ability' && action.command.abilityId).toBe('chat');
  });

  it('resupplies an ally who is out of ammunition, otherwise walks over', () => {
    const world = setup(['infiltrator', 'marine']);
    const marine = world.operative('op:marine')!;
    const walk = resolveContextAction(world, ['op:infiltrator'], { kind: 'operative', id: 'op:marine' }, vec(5, 5));
    expect(walk.kind).toBe('move');
    marine.inventory['pistol-round'] = 0;
    const action = resolveContextAction(world, ['op:infiltrator'], { kind: 'operative', id: 'op:marine' }, vec(5, 5));
    expect(action.kind === 'ability' && action.command.abilityId).toBe('resupply');
  });
});

describe('resolveAbilityOrder', () => {
  it('targets the ground for thrown items and validates range', () => {
    const world = setup(['infiltrator']);
    place(world, 'infiltrator', 10, 10);
    expect(resolveAbilityOrder(world, 'op:infiltrator', 'throw-stone', null, vec(14, 10)).result.ok).toBe(true);
    const far = resolveAbilityOrder(world, 'op:infiltrator', 'throw-stone', null, vec(35, 35));
    expect(far.result.ok).toBe(false);
  });

  it('needs a target for targeted abilities', () => {
    const world = setup(['recon']);
    expect(resolveAbilityOrder(world, 'op:recon', 'dart', null, vec(5, 5)).command).toBeNull();
  });
});

describe('abilityBar', () => {
  it('lists role skills first and swaps carry for drop while carrying', () => {
    const world = setup(['infiltrator']);
    const op = world.operative('op:infiltrator')!;
    const bar = abilityBar(op);
    expect(bar[0]).toBe('takedown');
    expect(bar.length).toBeLessThanOrEqual(10);
    expect(bar.at(-1)).toBe('carry');
    op.carrying = 'g:1';
    expect(abilityBar(op).at(-1)).toBe('drop');
  });
});
