import { describe, expect, it } from 'vitest';
import { type CameraPose, introReel, outroReel, sampleReel, shotStart } from './cinematic';

const opening: CameraPose = { x: 20, z: 90, yaw: Math.PI / 4, pitch: 0.93, distance: 40 };

describe('cinematic reels', () => {
  const intro = introReel({ opening, objective: { x: 130, z: 30 }, mapWidth: 160, mapDepth: 120 });

  it('the insertion reel ends exactly on the opening view, so play starts without a jump', () => {
    const end = sampleReel(intro, shotStart(intro, intro.length) + 1);
    expect(end.done).toBe(true);
    expect(end.pose).toEqual(opening);
  });

  it('opens over the whole map and visits the objective before the squad', () => {
    const first = sampleReel(intro, 0);
    expect(first.index).toBe(0);
    expect(first.pose.x).toBe(80);
    expect(first.pose.distance).toBeGreaterThan(150);
    const second = sampleReel(intro, shotStart(intro, 1) + 0.01);
    expect(second.index).toBe(1);
    expect(second.pose.x).toBeCloseTo(130);
    expect(second.pose.z).toBeCloseTo(30);
  });

  it('eases a glide in and out but keeps a drift moving at a steady pace', () => {
    const glide = intro[2]!;
    const start = shotStart(intro, 2);
    const early = sampleReel(intro, start + glide.seconds * 0.1).pose.x - glide.from.x;
    const mid = sampleReel(intro, start + glide.seconds * 0.5).pose.x - glide.from.x;
    expect(Math.abs(early)).toBeLessThan(Math.abs(mid) * 0.1);
    const drift = intro[0]!;
    const quarter = sampleReel(intro, drift.seconds * 0.25).pose.yaw - drift.from.yaw;
    expect(quarter).toBeCloseTo((drift.to.yaw - drift.from.yaw) * 0.25);
  });

  it('the closing reel starts where the camera was and rests on an orbit of the focus', () => {
    const outro = outroReel(opening, { x: 10, z: 60 }, true);
    expect(sampleReel(outro, 0).pose).toEqual(opening);
    expect(outro.at(-1)?.rest).toBe(true);
    const orbit = sampleReel(outro, shotStart(outro, 1) + 30).pose;
    expect(orbit.x).toBe(10);
    expect(orbit.z).toBe(60);
  });
});
