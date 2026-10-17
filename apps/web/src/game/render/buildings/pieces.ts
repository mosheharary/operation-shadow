import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Building kit: detailed façade pieces (window units, shutters, lintels, sills, door hoods),
// modelled once and drawn as instances, so every window in a level costs a few draw calls.
//
// Piece space: x along the wall, y up from the piece's base, z out of the wall's outer face
// (z = 0 on the face). `facadeMatrix` places a piece on a wall run.

/** Window opening size (metres). */
export const WINDOW = { width: 0.95, height: 1.25, sillHeight: 0.95 } as const;

const blk = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
};

/** Merges parts after dropping UVs and indices (pieces only need position and normal). */
function join(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((g) => {
    const geometry = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    return geometry;
  });
  const merged = mergeGeometries(prepared)!;
  merged.computeBoundingSphere();
  return merged;
}

const W = WINDOW.width;
const H = WINDOW.height;

/** Glass of a window (the glazing bars of `windowFrame` divide it into panes). */
export function windowGlass(): THREE.BufferGeometry {
  return join([blk(W, H, 0.02, 0, H / 2, 0.015)]);
}

/** Painted casing, a two-leaf sash with glazing bars (2 × 3 panes) and a drip moulding. */
export function windowFrame(): THREE.BufferGeometry {
  const casing = 0.09;
  const parts = [
    // Casing around the opening.
    blk(casing, H + casing * 2, 0.07, -(W + casing) / 2, H / 2, 0.035),
    blk(casing, H + casing * 2, 0.07, (W + casing) / 2, H / 2, 0.035),
    blk(W + casing * 2, casing, 0.07, 0, H + casing / 2, 0.035),
    blk(W, 0.05, 0.06, 0, 0.025, 0.03),
    // Meeting stiles of the two leaves and the transom.
    blk(0.05, H, 0.05, 0, H / 2, 0.035),
    blk(W, 0.04, 0.045, 0, H * 0.66, 0.035),
    // Glazing bars: one per leaf vertically, one horizontally across the lower lights.
    blk(0.022, H * 0.66, 0.035, -W / 4, H * 0.33, 0.03),
    blk(0.022, H * 0.66, 0.035, W / 4, H * 0.33, 0.03),
    blk(W, 0.022, 0.035, 0, H * 0.33, 0.03),
    // Drip moulding over the casing.
    blk(W + casing * 2 + 0.06, 0.035, 0.1, 0, H + casing + 0.018, 0.05),
  ];
  return join(parts);
}

/** Dressed stone sill (with a drip) and a lintel with a keystone. */
export function windowStone(): THREE.BufferGeometry {
  return join([
    blk(W + 0.36, 0.07, 0.17, 0, -0.035, 0.085),
    blk(W + 0.3, 0.025, 0.04, 0, -0.08, 0.15),
    blk(W + 0.42, 0.19, 0.06, 0, H + 0.2, 0.03),
    blk(0.16, 0.26, 0.08, 0, H + 0.2, 0.045, 0, 0, 0),
  ]);
}

/** Width of one shutter leaf (two leaves cover the opening when closed). */
export const SHUTTER_WIDTH = W / 2 + 0.02;

/** One louvred shutter leaf, centred on x = 0, standing open against the wall. */
export function shutterLeaf(): THREE.BufferGeometry {
  const w = SHUTTER_WIDTH;
  const h = H + 0.06;
  const parts = [
    blk(0.05, h, 0.035, 0.025, h / 2, 0.018),
    blk(0.05, h, 0.035, w - 0.025, h / 2, 0.018),
    blk(w, 0.06, 0.035, w / 2, 0.03, 0.018),
    blk(w, 0.06, 0.035, w / 2, h - 0.03, 0.018),
    blk(w, 0.05, 0.035, w / 2, h * 0.5, 0.018),
  ];
  // Angled louvres between the rails.
  for (let y = 0.1; y < h - 0.08; y += 0.055) {
    if (Math.abs(y - h * 0.5) < 0.05) continue;
    parts.push(blk(w - 0.1, 0.045, 0.008, w / 2, y, 0.016, -0.6, 0, 0));
  }
  return join(parts).translate(-w / 2, -0.03, 0);
}

/** Small pitched hood over a door on two shaped brackets. */
export function doorHood(width: number): THREE.BufferGeometry {
  const w = width + 0.5;
  const depth = 0.55;
  const parts = [
    blk(w, 0.04, depth + 0.06, 0, 0.18, depth / 2, 0.32, 0, 0),
    blk(w + 0.04, 0.08, 0.06, 0, 0.12, depth + 0.02),
    blk(w, 0.06, 0.06, 0, 0.3, 0.03),
  ];
  for (const side of [-1, 1]) {
    parts.push(blk(0.07, 0.26, 0.07, side * (w / 2 - 0.08), 0.0, 0.06));
    parts.push(blk(0.06, 0.06, depth - 0.05, side * (w / 2 - 0.08), 0.06, depth / 2, 0.75, 0, 0));
  }
  return join(parts);
}

/** Cast-iron downpipe from the eave to the ground: hopper, brackets and a shoe (height 1 m, scaled). */
export function downpipe(): THREE.BufferGeometry {
  const pipe = new THREE.CylinderGeometry(0.045, 0.045, 1, 8, 1, true).translate(0, 0.5, 0.08);
  const parts: THREE.BufferGeometry[] = [pipe];
  for (const y of [0.15, 0.5, 0.85]) parts.push(blk(0.12, 0.03, 0.1, 0, y, 0.05));
  return join(parts);
}

/** Pipe fittings that must not stretch with the pipe: hopper head at the top, shoe at the foot. */
export function downpipeEnds(height: number): THREE.BufferGeometry {
  return join([
    new THREE.CylinderGeometry(0.11, 0.06, 0.22, 8).translate(0, height - 0.1, 0.1),
    new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8).rotateX(Math.PI / 2 - 0.5).translate(0, 0.08, 0.16),
  ]);
}

/** Half-round gutter along an eave (length 1 m along x, scaled), open side up. */
export function gutter(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.075, 0.075, 1, 10, 1, true, Math.PI / 2, Math.PI);
  g.rotateZ(Math.PI / 2);
  return join([g]);
}

/**
 * Places a piece on a wall: `a` is the run's start, `dir` its unit direction, `t` the distance
 * along it, `out` the offset of the wall's outer face from the run line, `y` the piece base.
 * Piece +z points out of the wall and +x against the run (so the basis stays right-handed).
 */
export function facadeMatrix(a: { x: number; z: number }, dir: { x: number; z: number }, t: number, out: number, y: number, scale?: THREE.Vector3): THREE.Matrix4 {
  const outward = { x: dir.z, z: -dir.x };
  const position = new THREE.Vector3(a.x + dir.x * t + outward.x * out, y, a.z + dir.z * t + outward.z * out);
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(-dir.x, 0, -dir.z), new THREE.Vector3(0, 1, 0), new THREE.Vector3(outward.x, 0, outward.z));
  const m = new THREE.Matrix4().makeTranslation(position.x, position.y, position.z).multiply(basis);
  if (scale) m.scale(scale);
  return m;
}

/** Instances of one kit piece, collected while the buildings are laid out. */
export class KitBatch {
  readonly matrices: THREE.Matrix4[] = [];
  readonly colors: THREE.Color[] = [];
  constructor(
    readonly geometry: THREE.BufferGeometry,
    readonly material: THREE.Material,
    readonly shadow = true,
  ) {}
  add(matrix: THREE.Matrix4, color = new THREE.Color(1, 1, 1)): void {
    this.matrices.push(matrix);
    this.colors.push(color);
  }
}
