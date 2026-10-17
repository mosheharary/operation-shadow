import type { FigurePose } from '../figure';

/** Clip names in the processed animation library (tools/media/model-sources.ts). */
export type ClipName =
  | 'Idle'
  | 'Walk'
  | 'Run'
  | 'CrouchIdle'
  | 'CrouchWalk'
  | 'Swim'
  | 'SwimIdle'
  | 'Death'
  | 'Aim'
  | 'Talk'
  | 'Lantern'
  | 'Carry'
  | 'Interact';

/** Clips that move the character across the ground (played at the speed it actually moves). */
export const LOCOMOTION: ReadonlySet<ClipName> = new Set(['Walk', 'Run', 'CrouchWalk', 'Swim']);

/** How the body is laid out for a pose the library has no clip for. */
export type BodyLayout = 'upright' | 'prone' | 'lying' | 'carried';

export interface ClipChoice {
  /** Whole-body clip (legs only while an upper-body clip plays). */
  base: ClipName;
  /** Upper-body clip layered over the base (aiming, carrying, talking, lantern). */
  upper: ClipName | null;
  /** Play once and hold the last frame (falling down). */
  once: boolean;
  layout: BodyLayout;
}

/**
 * Picks the animation for a pose. The library has no crawl, so a prone character is laid face
 * down and plays the walk cycle slowly (from above, the arm and leg swing reads as a crawl).
 */
export function clipsFor(pose: FigurePose, lantern = false): ClipChoice {
  if (pose.carried) return { base: 'Death', upper: null, once: true, layout: 'carried' };
  if (pose.lying !== 'none') return { base: 'Death', upper: null, once: true, layout: 'lying' };
  if (pose.swimming) return { base: pose.moving ? 'Swim' : 'SwimIdle', upper: null, once: false, layout: 'upright' };
  if (pose.stance === 'prone') return { base: pose.moving ? 'Walk' : 'Idle', upper: null, once: false, layout: 'prone' };
  if (pose.climbing) return { base: 'Interact', upper: null, once: false, layout: 'upright' };
  const base: ClipName = pose.stance === 'crouch' ? (pose.moving ? 'CrouchWalk' : 'CrouchIdle') : pose.moving ? (pose.running ? 'Run' : 'Walk') : 'Idle';
  const upper: ClipName | null = pose.carrying ? 'Carry' : pose.aiming ? 'Aim' : pose.talking ? 'Talk' : lantern && !pose.running ? 'Lantern' : null;
  return { base, upper, once: false, layout: 'upright' };
}
