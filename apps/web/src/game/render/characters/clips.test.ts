import { describe, expect, it } from 'vitest';
import type { FigurePose } from '../figure';
import { clipsFor } from './clips';

const pose = (patch: Partial<FigurePose> = {}): FigurePose => ({
  stance: 'stand',
  moving: false,
  running: false,
  lying: 'none',
  carrying: false,
  carried: false,
  aiming: false,
  talking: false,
  swimming: false,
  climbing: false,
  ...patch,
});

describe('clipsFor', () => {
  it('picks locomotion by stance and gait', () => {
    expect(clipsFor(pose()).base).toBe('Idle');
    expect(clipsFor(pose({ moving: true })).base).toBe('Walk');
    expect(clipsFor(pose({ moving: true, running: true })).base).toBe('Run');
    expect(clipsFor(pose({ stance: 'crouch' })).base).toBe('CrouchIdle');
    expect(clipsFor(pose({ stance: 'crouch', moving: true })).base).toBe('CrouchWalk');
  });

  it('lays prone characters face down and crawls with a slow walk cycle', () => {
    expect(clipsFor(pose({ stance: 'prone', moving: true }))).toMatchObject({ base: 'Walk', layout: 'prone' });
    expect(clipsFor(pose({ stance: 'prone' }))).toMatchObject({ base: 'Idle', layout: 'prone' });
  });

  it('falls once and stays down when lying or carried', () => {
    expect(clipsFor(pose({ lying: 'back' }))).toMatchObject({ base: 'Death', once: true, layout: 'lying' });
    expect(clipsFor(pose({ carried: true, lying: 'back' }))).toMatchObject({ base: 'Death', once: true, layout: 'carried' });
  });

  it('layers upper-body actions over the legs', () => {
    expect(clipsFor(pose({ aiming: true, moving: true }))).toMatchObject({ base: 'Walk', upper: 'Aim' });
    expect(clipsFor(pose({ carrying: true, aiming: true })).upper).toBe('Carry');
    expect(clipsFor(pose({ talking: true })).upper).toBe('Talk');
    expect(clipsFor(pose(), true).upper).toBe('Lantern');
    expect(clipsFor(pose({ moving: true, running: true }), true).upper).toBeNull();
  });

  it('swims in deep water whatever the stance', () => {
    expect(clipsFor(pose({ swimming: true, stance: 'crouch', moving: true }))).toMatchObject({ base: 'Swim', layout: 'upright' });
  });
});
