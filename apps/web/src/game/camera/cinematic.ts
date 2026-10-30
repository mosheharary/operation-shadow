import type { Vec2 } from '@operation-shadow/engine';

/** Where the camera looks from: a ground point, a heading, a tilt and a distance (as the camera rig). */
export interface CameraPose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  distance: number;
}

/**
 * One camera move. `glide` eases in and out (a deliberate move from one framing to another);
 * `drift` keeps a steady pace (a slow pan or orbit that should not look like it stops).
 */
export interface Shot {
  from: CameraPose;
  to: CameraPose;
  seconds: number;
  ease: 'glide' | 'drift';
  /** A resting shot: skipping jumps here instead of past the end (the orbit behind the debrief). */
  rest?: boolean;
}

export interface ReelSample {
  pose: CameraPose;
  index: number;
  done: boolean;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), yaw: lerp(a.yaw, b.yaw, t), pitch: lerp(a.pitch, b.pitch, t), distance: lerp(a.distance, b.distance, t) };
}

/** The pose `elapsed` seconds into a reel; past the end it holds the last frame. */
export function sampleReel(shots: readonly Shot[], elapsed: number): ReelSample {
  let start = 0;
  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i]!;
    if (elapsed < start + shot.seconds) {
      const t = Math.max(0, (elapsed - start) / shot.seconds);
      return { pose: lerpPose(shot.from, shot.to, shot.ease === 'glide' ? smooth(t) : t), index: i, done: false };
    }
    start += shot.seconds;
  }
  const last = shots[shots.length - 1]!;
  return { pose: { ...last.to }, index: shots.length - 1, done: true };
}

/** Seconds from the start of the reel to the start of shot `index`. */
export function shotStart(shots: readonly Shot[], index: number): number {
  return shots.slice(0, index).reduce((sum, shot) => sum + shot.seconds, 0);
}

export interface IntroPoints {
  /** The camera's opening pose: the reel ends exactly there, so play picks up without a jump. */
  opening: CameraPose;
  /** The primary objective (falls back to the map centre). */
  objective: Vec2;
  mapWidth: number;
  mapDepth: number;
}

/** Shot titles, in order, for the captions. */
export const INTRO_SHOTS = ['establishing', 'objective', 'insertion'] as const;

/**
 * The insertion reel: a high establishing sweep across the whole map, a slow orbit around the
 * primary objective, then a long descending glide back to the squad on its insertion point.
 */
export function introReel({ opening, objective, mapWidth, mapDepth }: IntroPoints): Shot[] {
  const centre = { x: mapWidth / 2, z: mapDepth / 2 };
  const wide = Math.max(mapWidth, mapDepth) * 1.05;
  const establishing: Shot = {
    from: { ...centre, yaw: opening.yaw - 0.55, pitch: 1.12, distance: wide * 1.08 },
    to: { ...centre, yaw: opening.yaw - 0.2, pitch: 1.0, distance: wide * 0.92 },
    seconds: 4,
    ease: 'drift',
  };
  // The objective is seen from the squad's side, as they will approach it.
  const orbitFrom = { ...objective, yaw: opening.yaw + 0.5, pitch: 0.62, distance: 36 };
  const orbitTo = { ...objective, yaw: opening.yaw - 0.15, pitch: 0.7, distance: 30 };
  return [
    establishing,
    { from: orbitFrom, to: orbitTo, seconds: 4, ease: 'drift' },
    { from: orbitTo, to: { ...opening }, seconds: 3.6, ease: 'glide' },
  ];
}

/**
 * The closing beat: a glide from wherever the camera was to a low framing of the squad's last
 * position, then a slow orbit that keeps turning behind the debrief.
 */
export function outroReel(current: CameraPose, focus: Vec2, success: boolean): Shot[] {
  const settle: CameraPose = { ...focus, yaw: current.yaw + (success ? 0.45 : -0.45), pitch: success ? 0.55 : 0.82, distance: success ? 26 : 34 };
  // Four slow turns (one every two and a half minutes): long enough for anyone reading the debrief.
  const orbit: CameraPose = { ...settle, yaw: settle.yaw + (success ? 1 : -1) * Math.PI * 8 };
  return [
    { from: current, to: settle, seconds: 2.8, ease: 'glide' },
    { from: settle, to: orbit, seconds: 600, ease: 'drift', rest: true },
  ];
}

interface Reel {
  shots: Shot[];
  startedAt: number;
  index: number;
  onShot?: (index: number) => void;
  onEnd?: () => void;
}

let reel: Reel | null = null;

/** Takes the camera away from the player and plays `shots` (real time: unaffected by pause or game speed). */
export function playReel(shots: Shot[], callbacks: { onShot?: (index: number) => void; onEnd?: () => void } = {}): void {
  reel = { shots, startedAt: performance.now(), index: 0, ...callbacks };
  callbacks.onShot?.(0);
}

/** Hands the camera back without running the end callback (restart, unmount). */
export function stopReel(): void {
  reel = null;
}

export const reelPlaying = (): boolean => reel !== null;

/** Jumps to the reel's resting shot, or to its end when it has none ahead. */
export function skipReel(): void {
  if (!reel) return;
  const rest = reel.shots.findIndex((shot, i) => shot.rest && i > reel!.index);
  if (rest < 0) {
    finish();
    return;
  }
  reel.startedAt = performance.now() - shotStart(reel.shots, rest) * 1000;
}

function finish(): void {
  const ended = reel;
  reel = null;
  ended?.onEnd?.();
}

/** Called by the camera rig every frame: the pose to show, or null when the player has the camera. */
export function reelPose(now: number): CameraPose | null {
  if (!reel) return null;
  const sample = sampleReel(reel.shots, (now - reel.startedAt) / 1000);
  if (sample.index !== reel.index) {
    reel.index = sample.index;
    reel.onShot?.(sample.index);
  }
  if (sample.done) finish();
  return sample.pose;
}
