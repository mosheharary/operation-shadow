/** Ground-plane vector in metres: x = east, z = south (three.js convention, y is up). */
export interface Vec2 {
  x: number;
  z: number;
}

export const vec = (x: number, z: number): Vec2 => ({ x, z });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, z: a.z * s });
// sqrt is correctly rounded everywhere (unlike Math.hypot), keeping results identical across browsers.
export const length = (a: Vec2): number => Math.sqrt(a.x * a.x + a.z * a.z);
export const distanceSq = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};
export const distance = (a: Vec2, b: Vec2): number => Math.sqrt(distanceSq(a, b));

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len > 1e-9 ? { x: a.x / len, z: a.z / len } : { x: 0, z: 0 };
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Heading in radians measured from +x toward +z (atan2(z, x)). A facing of 0 looks east,
 * π/2 looks south.
 */
export const headingTo = (from: Vec2, to: Vec2): number => Math.atan2(to.z - from.z, to.x - from.x);
export const headingVector = (heading: number): Vec2 => ({ x: Math.cos(heading), z: Math.sin(heading) });

/** Wraps an angle to (-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/** Smallest signed difference from angle a to angle b. */
export const angleDelta = (a: number, b: number): number => wrapAngle(b - a);

/** Rotates `current` toward `target` by at most `maxStep` radians. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(delta) * maxStep);
}

/** Moves `from` toward `to` by at most `maxDistance`; returns the new point and whether it arrived. */
export function moveToward(from: Vec2, to: Vec2, maxDistance: number): { pos: Vec2; arrived: boolean } {
  const d = distance(from, to);
  if (d <= maxDistance || d < 1e-9) return { pos: { x: to.x, z: to.z }, arrived: true };
  const t = maxDistance / d;
  return { pos: { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t }, arrived: false };
}

/** Rounds to a fixed number of decimals; used to keep serialized state compact and stable. */
export const round = (value: number, decimals = 4): number => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};
