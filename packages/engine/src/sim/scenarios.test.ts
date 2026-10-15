import { describe, expect, it } from 'vitest';
import { vec, type Vec2 } from '../core/math';
import type { LevelBuilder } from '../level/builder';
import { Surface } from '../level/types';
import { buildTestLevel } from '../testing/test-level';
import { makeMission, makeWorld, runFor, runUntil } from '../testing/scenario';
import type { GuardSpawn, ObjectSpawn, ObjectiveDef } from './mission';
import { damageOperative } from './operatives';
import { createInitialState, SetupError } from './setup';
import { stateHash } from './snapshot';
import type { SpecialistId, Stance } from './types';
import { World } from './world';

const EAST = 0;
const WEST = Math.PI;

function guard(id: string, pos: Vec2, facing: number, extra: Partial<GuardSpawn> = {}): GuardSpawn {
  return { id, archetype: 'rifleman', rank: 'soldier', temperament: 'standard', sector: 'main', pos, facing, ...extra };
}

function level(paint?: (b: LevelBuilder) => void, size = { width: 40, depth: 40 }) {
  return buildTestLevel(size, (b) => {
    b.addZone({ id: 'extraction', kind: 'extraction', min: vec(0, 34), max: vec(6, 40) });
    b.addZone({ id: 'holding', kind: 'holding', min: vec(34, 0), max: vec(38, 4) });
    paint?.(b);
  });
}

function placeOperative(world: World, role: SpecialistId, pos: Vec2, stance: Stance = 'stand', facing = EAST) {
  const op = world.operative(`op:${role}`)!;
  op.pos = { ...pos };
  op.stance = stance;
  op.facing = facing;
  return op;
}

const detected = (world: World, guardId: string) => ['challenge', 'alerted', 'combat'].includes(world.guard(guardId)!.state);

describe('perception scenarios', () => {
  it('a patrol sees an exposed operative', () => {
    const lvl = level((b) => b.addRoute({ id: 'r1', points: [vec(20, 4), vec(20, 36)], waits: [0, 0], loop: true }));
    const world = makeWorld(lvl, makeMission(lvl, { guards: [{ id: 'g:patrol', archetype: 'rifleman', rank: 'soldier', temperament: 'standard', sector: 'main', routeId: 'r1' }] }), ['infiltrator']);
    placeOperative(world, 'infiltrator', vec(20, 18), 'stand');
    const events = runFor(world, 6);
    expect(events.some((e) => e.type === 'detected' && e.targetId === 'op:infiltrator')).toBe(true);
    expect(detected(world, 'g:patrol')).toBe(true);
  });

  it('a wall blocks sight', () => {
    const lvl = level((b) => b.addWall(vec(15, 0), vec(15, 40), { height: 3 }));
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), WEST)] }), ['infiltrator']);
    placeOperative(world, 'infiltrator', vec(10, 20), 'stand');
    runFor(world, 6);
    expect(world.guard('g:1')!.suspicion.find((e) => e.targetId === 'op:infiltrator')?.value ?? 0).toBe(0);
    expect(world.guard('g:1')!.state).toBe('post');
  });

  it('prone operatives are invisible in the far zone but standing ones are seen', () => {
    const lvl = level();
    const prone = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(25, 20), WEST)] }), ['infiltrator']);
    placeOperative(prone, 'infiltrator', vec(12, 20), 'prone');
    runFor(prone, 6);
    expect(prone.guard('g:1')!.suspicion[0]?.value ?? 0).toBe(0);

    const standing = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(25, 20), WEST)] }), ['infiltrator']);
    placeOperative(standing, 'infiltrator', vec(12, 20), 'stand');
    runFor(standing, 6);
    expect(detected(standing, 'g:1')).toBe(true);
  });

  it('even a prone operative is spotted inside the near zone', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), WEST)] }), ['infiltrator']);
    placeOperative(world, 'infiltrator', vec(15, 20), 'prone');
    runFor(world, 4);
    expect((world.guard('g:1')!.suspicion[0]?.value ?? 0) > 50).toBe(true);
  });

  it('darkness slows detection compared with daylight', () => {
    const lvl = level();
    const secondsToDetect = (timeOfDay: number) => {
      const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(30, 20), WEST)], timeOfDay }), ['infiltrator']);
      placeOperative(world, 'infiltrator', vec(14, 20), 'stand');
      let t = 0;
      while (!detected(world, 'g:1') && t < 30) {
        runFor(world, 0.25);
        t += 0.25;
      }
      return t;
    };
    expect(secondsToDetect(1)).toBeGreaterThan(secondsToDetect(13) * 1.5);
  });
});

describe('sound and distraction scenarios', () => {
  it('a noise in range triggers an investigation toward it', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(30, 20), EAST)] }), ['infiltrator']);
    placeOperative(world, 'infiltrator', vec(12, 20), 'crouch');
    expect(world.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'throw-stone', target: { kind: 'point', pos: vec(22, 20) } }).ok).toBe(true);
    runFor(world, 2);
    const g = world.guard('g:1')!;
    expect(g.state).toBe('investigate');
    expect(Math.abs(g.goal!.x - 22)).toBeLessThan(2);
  });

  it('a noise out of earshot changes nothing', () => {
    const lvl = level(undefined, { width: 80, depth: 40 });
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(70, 20), EAST)] }), ['infiltrator']);
    placeOperative(world, 'infiltrator', vec(12, 20), 'crouch');
    world.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'throw-stone', target: { kind: 'point', pos: vec(24, 20) } });
    runFor(world, 3);
    expect(world.guard('g:1')!.state).toBe('post');
  });

  it('running on gravel is heard where walking on grass is not', () => {
    const run = (surface: Surface, gait: 'walk' | 'run') => {
      const lvl = level((b) => b.paintSurface(vec(0, 15), vec(40, 25), surface));
      const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(30, 20), EAST)] }), ['infiltrator']);
      placeOperative(world, 'infiltrator', vec(10, 20), 'stand', EAST);
      world.enqueue({ type: 'move', unitIds: ['op:infiltrator'], target: vec(18, 20), gait });
      runFor(world, 3);
      return world.guard('g:1')!.memory.some((m) => m.noise === 'footstep');
    };
    expect(run(Surface.Gravel, 'run')).toBe(true);
    expect(run(Surface.Grass, 'walk')).toBe(false);
  });

  it('a remote noise device lures a calm guard to it', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(30, 30), EAST)] }), ['infiltrator']);
    placeOperative(world, 'infiltrator', vec(22, 30), 'crouch');
    world.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'place-device', target: { kind: 'self' } });
    runFor(world, 1.5);
    const device = world.state.objects.find((o) => o.type === 'device')!;
    world.enqueue({ type: 'move', unitIds: ['op:infiltrator'], target: vec(4, 12), gait: 'walk' });
    runFor(world, 8);
    world.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'trigger-device', target: { kind: 'entity', id: device.id } });
    expect(runUntil(world, (w) => w.guard('g:1')!.state === 'investigate', 2)).toBe(true);
    expect(runUntil(world, (w) => Math.hypot(w.guard('g:1')!.pos.x - 22, w.guard('g:1')!.pos.z - 30) < 3, 15)).toBe(true);
  });

  it('a disguised operative can hold a guard in conversation, turning him away from the squad', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), WEST)] }), ['deception', 'recon']);
    const fox = placeOperative(world, 'deception', vec(21.5, 20), 'stand');
    fox.disguised = true;
    world.enqueue({ type: 'ability', unitId: 'op:deception', abilityId: 'converse', target: { kind: 'entity', id: 'g:1' } });
    runFor(world, 1);
    expect(world.guard('g:1')!.state).toBe('distracted');
    // The guard now faces east, toward the Deception Specialist; the Recon specialist west of him goes unseen.
    placeOperative(world, 'recon', vec(10, 20), 'stand');
    runFor(world, 5);
    expect(world.guard('g:1')!.suspicion.find((e) => e.targetId === 'op:recon')?.value ?? 0).toBe(0);
  });
});

describe('abilities and rules', () => {
  it('rejects another specialist\'s restricted ability, missing items and bad targets', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), EAST)] }), ['recon', 'engineer']);
    const takedown = world.enqueue({ type: 'ability', unitId: 'op:recon', abilityId: 'takedown', target: { kind: 'entity', id: 'g:1' } });
    expect(takedown).toMatchObject({ ok: false, reason: 'not-your-ability' });
    world.operative('op:engineer')!.inventory.charge = 0;
    const charge = world.enqueue({ type: 'ability', unitId: 'op:engineer', abilityId: 'place-charge', target: { kind: 'point', pos: vec(10, 10) } });
    expect(charge).toMatchObject({ ok: false, reason: 'no-item' });
    const rifle = world.enqueue({ type: 'ability', unitId: 'op:recon', abilityId: 'rifle', target: { kind: 'entity', id: 'nobody' } });
    expect(rifle).toMatchObject({ ok: false, reason: 'invalid-target' });
  });

  it('allows a takedown from behind but not from the front', () => {
    const lvl = level();
    const behind = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), EAST)] }), ['infiltrator']);
    placeOperative(behind, 'infiltrator', vec(16, 20), 'crouch');
    expect(behind.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'takedown', target: { kind: 'entity', id: 'g:1' } }).ok).toBe(true);
    expect(runUntil(behind, (w) => w.guard('g:1')!.status === 'ko', 6)).toBe(true);

    const front = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), WEST)] }), ['infiltrator']);
    placeOperative(front, 'infiltrator', vec(19, 20), 'crouch');
    expect(front.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'takedown', target: { kind: 'entity', id: 'g:1' } })).toMatchObject({ ok: false, reason: 'condition' });
  });

  it('an unconscious guard comes round after the knockout timer and starts searching', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), EAST)] }), ['infiltrator']);
    placeOperative(world, 'infiltrator', vec(18.8, 20), 'crouch');
    world.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'takedown', target: { kind: 'entity', id: 'g:1' } });
    runFor(world, 2);
    expect(world.guard('g:1')!.status).toBe('ko');
    world.enqueue({ type: 'move', unitIds: ['op:infiltrator'], target: vec(3, 12), gait: 'walk' });
    runFor(world, 125);
    expect(world.guard('g:1')!.status).toBe('active');
    expect(world.state.alarm.peak).toBeGreaterThanOrEqual(2);
  });

  it('restraining keeps a guard down for good', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), EAST)] }), ['infiltrator']);
    placeOperative(world, 'infiltrator', vec(18.8, 20), 'crouch');
    world.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'takedown', target: { kind: 'entity', id: 'g:1' } });
    runFor(world, 2);
    world.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'restrain', target: { kind: 'entity', id: 'g:1' } });
    runFor(world, 4);
    expect(world.guard('g:1')!.status).toBe('restrained');
    runFor(world, 130);
    expect(world.guard('g:1')!.status).toBe('restrained');
  });

  it('a patrol that finds a dead body raises a sector alert', () => {
    const lvl = level((b) => b.addRoute({ id: 'r1', points: [vec(30, 20), vec(30, 21)], waits: [3, 3], loop: true }));
    const mission = makeMission(lvl, {
      guards: [guard('g:victim', vec(20, 20), EAST), { id: 'g:patrol', archetype: 'rifleman', rank: 'soldier', temperament: 'standard', sector: 'main', routeId: 'r1' }],
    });
    const world = makeWorld(lvl, mission, ['infiltrator']);
    world.guard('g:patrol')!.facing = WEST;
    placeOperative(world, 'infiltrator', vec(18.8, 20), 'crouch');
    world.enqueue({ type: 'ability', unitId: 'op:infiltrator', abilityId: 'knife', target: { kind: 'entity', id: 'g:victim' } });
    runFor(world, 1.5);
    world.enqueue({ type: 'move', unitIds: ['op:infiltrator'], target: vec(3, 12), gait: 'run' });
    expect(runUntil(world, (w) => w.guard('g:victim')!.found, 40)).toBe(true);
    expect(world.state.alarm.persistent).toBeGreaterThanOrEqual(3);
    expect(world.state.stats.bodiesFound).toBe(1);
  });

  it('a guard challenges a still operative, captures them, and a teammate can free them', () => {
    const lvl = level();
    const world = makeWorld(
      lvl,
      makeMission(lvl, { guards: [guard('g:1', vec(20, 20), WEST, { temperament: 'passive' })], holdingZoneId: 'holding' }),
      ['infiltrator', 'medic'],
    );
    placeOperative(world, 'infiltrator', vec(15, 20), 'stand');
    placeOperative(world, 'medic', vec(20, 36), 'crouch');
    expect(runUntil(world, (w) => w.operative('op:infiltrator')!.status === 'captured', 12)).toBe(true);
    expect(runUntil(world, (w) => w.guard('g:1')!.state === 'return' || w.guard('g:1')!.state === 'post', 60)).toBe(true);
    const captured = world.operative('op:infiltrator')!;
    expect(captured.pos.x).toBeGreaterThan(33);
    Object.assign(world.guard('g:1')!, { status: 'ko', koUntil: 1_000_000 }); // keep the rescue focused on the free mechanic
    expect(world.enqueue({ type: 'ability', unitId: 'op:medic', abilityId: 'free', target: { kind: 'entity', id: 'op:infiltrator' } }).ok).toBe(true);
    expect(runUntil(world, (w) => w.operative('op:infiltrator')!.status === 'active', 40)).toBe(true);
  });

  it('a downed operative bleeds out unless revived by the medic', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl), ['infiltrator', 'medic']);
    placeOperative(world, 'infiltrator', vec(10, 10), 'stand');
    placeOperative(world, 'medic', vec(14, 10), 'stand');
    damageOperative(world, world.operative('op:infiltrator')!, 500, 'test');
    expect(world.operative('op:infiltrator')!.status).toBe('downed');
    world.enqueue({ type: 'ability', unitId: 'op:medic', abilityId: 'revive', target: { kind: 'entity', id: 'op:infiltrator' } });
    expect(runUntil(world, (w) => w.operative('op:infiltrator')!.status === 'active', 10)).toBe(true);
    expect(world.state.status).toBe('running');

    const unaided = makeWorld(lvl, makeMission(lvl), ['infiltrator']);
    damageOperative(unaided, unaided.operative('op:infiltrator')!, 500, 'test');
    runFor(unaided, 46);
    expect(unaided.state.status).toBe('failed');
    expect(unaided.state.outcome?.code).toBe('operative-killed');
  });

  it('a disguise fools a soldier, but not an officer up close or anyone seeing a body carried', () => {
    const lvl = level();
    const soldier = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), WEST)] }), ['deception']);
    placeOperative(soldier, 'deception', vec(16, 20), 'stand').disguised = true;
    runFor(soldier, 6);
    expect(soldier.guard('g:1')!.suspicion[0]?.value ?? 0).toBe(0);

    const officer = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), WEST, { rank: 'officer' })] }), ['deception']);
    placeOperative(officer, 'deception', vec(17, 20), 'stand').disguised = true;
    runFor(officer, 6);
    expect(officer.guard('g:1')!.suspicion[0]?.value ?? 0).toBeGreaterThan(45);

    const carrying = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), WEST), guard('g:body', vec(30, 30), EAST)] }), ['deception']);
    const fox = placeOperative(carrying, 'deception', vec(14, 20), 'stand');
    fox.disguised = true;
    carrying.guard('g:body')!.status = 'ko';
    carrying.guard('g:body')!.koUntil = 1_000_000;
    fox.carrying = 'g:body';
    carrying.guard('g:body')!.carriedBy = fox.id;
    runFor(carrying, 6);
    expect(detected(carrying, 'g:1')).toBe(true);
  });
});

describe('objectives, extraction and failure', () => {
  const objects: ObjectSpawn[] = [{ type: 'objective-target', id: 'radio', pos: vec(30, 30), label: 'Fire-control radio', sector: 'main' }];
  const objectives: ObjectiveDef[] = [
    { id: 'disable-radio', kind: 'disable-target', targetId: 'radio', required: true, title: 'Disable the radio', description: '' },
  ];

  it('completes a mandatory objective and extracts only once it is done', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { objects, objectives }), ['engineer', 'marine']);
    // Extracting first does nothing: the required objective is still open.
    runFor(world, 1);
    expect(world.state.status).toBe('running');
    expect(world.enqueue({ type: 'ability', unitId: 'op:engineer', abilityId: 'sabotage', target: { kind: 'entity', id: 'radio' } }).ok).toBe(true);
    expect(runUntil(world, (w) => w.state.objectives[0]!.status === 'completed', 40)).toBe(true);
    world.enqueue({ type: 'move', unitIds: ['op:engineer', 'op:marine'], target: vec(3, 37), gait: 'run' });
    expect(runUntil(world, (w) => w.state.status !== 'running', 40)).toBe(true);
    expect(world.state.status).toBe('success');
    expect(world.state.outcome?.code).toBe('extracted');
  });

  it('a demolition charge also completes the objective, loudly', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { objects, objectives, guards: [guard('g:far', vec(10, 35), EAST)] }), ['engineer']);
    placeOperative(world, 'engineer', vec(27, 28), 'crouch');
    world.enqueue({ type: 'ability', unitId: 'op:engineer', abilityId: 'place-charge', target: { kind: 'point', pos: vec(29.5, 29.5) } });
    expect(runUntil(world, (w) => w.state.objects.some((o) => o.type === 'charge'), 8)).toBe(true);
    world.enqueue({ type: 'move', unitIds: ['op:engineer'], target: vec(15, 15), gait: 'run' });
    runFor(world, 10);
    expect(world.object('radio')).toMatchObject({ destroyed: true });
    expect(world.state.objectives[0]!.status).toBe('completed');
    expect(world.state.alarm.persistent).toBeGreaterThanOrEqual(3);
  });

  it('fails the mission at the stated alarm limit', () => {
    const lvl = level();
    const world = makeWorld(lvl, makeMission(lvl, { guards: [guard('g:1', vec(20, 20), WEST, { temperament: 'strict' })], failAtAlarm: 3 }), ['infiltrator']);
    placeOperative(world, 'infiltrator', vec(14, 20), 'stand');
    expect(runUntil(world, (w) => w.state.status === 'failed', 10)).toBe(true);
    expect(world.state.outcome?.code).toBe('alarm-limit');
  });

  it('rejects invalid missions and squads before gameplay begins', () => {
    const lvl = level();
    const mission = { ...makeMission(lvl), requiredRoles: ['marine' as const], squadSize: { min: 2, max: 4 } };
    expect(() => createInitialState(lvl, mission, { seed: 1, squad: ['engineer', 'infiltrator'], difficulty: 'standard' })).toThrow(/requires: marine/);
    expect(() => createInitialState(lvl, mission, { seed: 1, squad: ['marine'], difficulty: 'standard' })).toThrow(SetupError);
    const dupes = makeMission(lvl, { guards: [guard('g:1', vec(5, 5), 0), guard('g:1', vec(6, 6), 0)] });
    expect(() => createInitialState(lvl, dupes, { seed: 1, squad: ['marine'], difficulty: 'standard' })).toThrow(/Duplicate/);
    const badPost = makeMission(lvl, { guards: [{ id: 'g:x', archetype: 'rifleman', rank: 'soldier', temperament: 'standard', sector: 'main', postId: 'missing' }] });
    expect(() => createInitialState(lvl, badPost, { seed: 1, squad: ['marine'], difficulty: 'standard' })).toThrow(/unknown post/);
  });
});

describe('determinism and save/load', () => {
  function scriptedWorld(seed: number) {
    const lvl = level((b) => {
      b.addWall(vec(16, 10), vec(16, 30), { height: 3 });
      b.addRoute({ id: 'r1', points: [vec(25, 8), vec(25, 32), vec(34, 32), vec(34, 8)], waits: [1, 0, 2, 0], loop: true });
    });
    const mission = makeMission(lvl, {
      guards: [
        { id: 'g:patrol', archetype: 'rifleman', rank: 'soldier', temperament: 'standard', sector: 'main', routeId: 'r1' },
        guard('g:post', vec(30, 20), WEST),
      ],
    });
    return { lvl, mission, world: makeWorld(lvl, mission, ['infiltrator', 'recon', 'engineer'], { seed }) };
  }

  const orders = (world: World, t: number) => {
    if (t === 10) world.enqueue({ type: 'move', unitIds: ['op:infiltrator'], target: vec(12, 20), gait: 'walk' });
    if (t === 40) world.enqueue({ type: 'ability', unitId: 'op:recon', abilityId: 'throw-stone', target: { kind: 'point', pos: vec(12, 12) } });
    if (t === 120) world.enqueue({ type: 'move', unitIds: ['op:engineer', 'op:recon'], target: vec(10, 35), gait: 'run' });
  };

  it('replays identically from the same seed and orders', () => {
    const a = scriptedWorld(99).world;
    const b = scriptedWorld(99).world;
    for (let t = 0; t < 400; t += 1) {
      orders(a, t);
      orders(b, t);
      a.step();
      b.step();
    }
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });

  it('restores a saved mission and continues exactly like an uninterrupted run', () => {
    const { lvl, mission, world: original } = scriptedWorld(5);
    let saved = null as ReturnType<World['snapshot']> | null;
    for (let t = 0; t < 400; t += 1) {
      if (t === 200) saved = JSON.parse(JSON.stringify(original.snapshot()));
      orders(original, t);
      original.step();
    }
    const restored = World.restore(lvl, mission, saved!);
    for (let t = 200; t < 400; t += 1) {
      orders(restored, t);
      restored.step();
    }
    expect(stateHash(restored.state)).toBe(stateHash(original.state));
  });

  it('refuses to restore a save into a different mission', () => {
    const { lvl, mission, world } = scriptedWorld(1);
    const save = world.snapshot();
    expect(() => World.restore(lvl, { ...mission, id: 'other' }, save)).toThrow(/different mission/);
  });
});
