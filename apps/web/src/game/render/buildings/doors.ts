import type { StructureDef } from '@operation-shadow/engine';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tinted } from '../geom';
import { surfaceMaterial, withMetreUvs } from '../materials/surface';
import { material } from '../palette';

// Doors: modelled leaves that swing on their hinges. Door space: hinge on the y axis, the leaf
// along +x from 0 to its width, y up from the threshold, centred on z = 0 (the wall line), with
// hardware on both faces.

export type DoorStyle = 'panel' | 'plank' | 'steel';

/** Panelled doors on houses and offices, steel on bunkers, ledged plank doors everywhere else. */
export function doorStyleFor(kind: StructureDef['kind'] | undefined): DoorStyle {
  if (kind === 'house' || kind === 'office') return 'panel';
  if (kind === 'bunker') return 'steel';
  return 'plank';
}

export const DOOR_HEIGHT = 2.2;
const T = 0.05;

export interface DoorModel {
  root: THREE.Group;
  /** Hasp and padlock, shown while the door is locked. */
  padlock: THREE.Object3D;
}

const blk = (w: number, h: number, d: number, x: number, y: number, z: number, rz = 0): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  return g.translate(x, y, z);
};

/** Merges parts keeping `uvMetres` (door-local texture coordinates) and colour. */
function joinTextured(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(
    parts.map((g) => {
      const geometry = withMetreUvs(g.index ? g.toNonIndexed() : g);
      if (!geometry.attributes.color) tinted(geometry, '#ffffff');
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uvMetres', 'color'].includes(name)) geometry.deleteAttribute(name);
      return geometry;
    }),
  )!;
}

function joinPlain(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(
    parts.map((g) => {
      const geometry = g.index ? g.toNonIndexed() : g;
      for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      return geometry;
    }),
  )!;
}

const woodMaterial = () => surfaceMaterial('planks', { scale: 1.1, projection: 'uv', vertexColors: true, roughness: 0.8, macro: 0.25 });
const paintedMaterial = () => surfaceMaterial('planks-light', { scale: 0.9, projection: 'uv', vertexColors: true, roughness: 0.65, normalStrength: 0.5, macro: 0.2 });
const steelMaterial = () => surfaceMaterial('metal', { scale: 1.4, projection: 'uv', vertexColors: true, metalness: 0.5, roughness: 0.6 });
const ironMaterial = () => material('#26282a', { metalness: 0.6, roughness: 0.5 });
const brassMaterial = () => material('#b08d4a', { metalness: 0.85, roughness: 0.35 });

function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Hardware on both faces at (x, y): built for +z and mirrored to −z. */
function bothFaces(make: (face: 1 | -1) => THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  return [...make(1), ...make(-1)];
}

function panelDoor(width: number, paint: THREE.Color): { leaf: THREE.Mesh[]; metal: THREE.BufferGeometry[]; brass: THREE.BufferGeometry[] } {
  const h = DOOR_HEIGHT;
  const stile = 0.11;
  const parts: THREE.BufferGeometry[] = [
    tinted(blk(stile, h, T, stile / 2, h / 2, 0), paint),
    tinted(blk(stile, h, T, width - stile / 2, h / 2, 0), paint),
    tinted(blk(width - stile * 2, 0.2, T, width / 2, 0.1, 0), paint),
    tinted(blk(width - stile * 2, 0.13, T, width / 2, h * 0.47, 0), paint),
    tinted(blk(width - stile * 2, 0.14, T, width / 2, h - 0.07, 0), paint),
    tinted(blk(0.08, h - 0.34, T, width / 2, h / 2, 0), paint),
  ];
  // Four sunk panels with raised fields, a shade darker.
  const panelW = (width - stile * 2 - 0.08) / 2;
  const field = paint.clone().multiplyScalar(0.88);
  for (const col of [0, 1]) {
    const x = stile + panelW / 2 + col * (panelW + 0.08);
    for (const [y0, y1] of [
      [0.2, h * 0.47 - 0.065],
      [h * 0.47 + 0.065, h - 0.14],
    ] as const) {
      const ph = y1 - y0;
      // Sunk panel with a bolection moulding round it and a raised field in the middle.
      parts.push(tinted(blk(panelW, ph, T * 0.35, x, (y0 + y1) / 2, 0), field));
      for (const face of [1, -1]) {
        const z = face * (T / 2 + 0.006);
        parts.push(tinted(blk(panelW, 0.025, 0.012, x, y0 + 0.012, z), paint.clone().multiplyScalar(1.12)));
        parts.push(tinted(blk(panelW, 0.025, 0.012, x, y1 - 0.012, z), paint.clone().multiplyScalar(1.12)));
        parts.push(tinted(blk(0.025, ph, 0.012, x - panelW / 2 + 0.012, (y0 + y1) / 2, z), paint.clone().multiplyScalar(1.12)));
        parts.push(tinted(blk(0.025, ph, 0.012, x + panelW / 2 - 0.012, (y0 + y1) / 2, z), paint.clone().multiplyScalar(1.12)));
        parts.push(tinted(blk(panelW - 0.16, ph - 0.16, 0.02, x, (y0 + y1) / 2, face * T * 0.2), paint.clone().multiplyScalar(1.05)));
      }
    }
  }
  const brass = bothFaces((face) => [
    new THREE.SphereGeometry(0.035, 10, 8).translate(width - 0.1, 1.0, face * (T / 2 + 0.05)),
    new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6).rotateX(Math.PI / 2).translate(width - 0.1, 1.0, face * (T / 2 + 0.025)),
    blk(0.05, 0.16, 0.008, width - 0.1, 0.94, face * (T / 2 + 0.004)),
  ]);
  const metal = [0.25, h / 2, h - 0.25].map((y) => blk(0.03, 0.12, T + 0.02, 0.0, y, 0));
  return { leaf: [mesh(joinTextured(parts), paintedMaterial())], metal, brass };
}

function plankDoor(width: number, seed: number): { leaf: THREE.Mesh[]; metal: THREE.BufferGeometry[]; brass: THREE.BufferGeometry[] } {
  const h = DOOR_HEIGHT;
  const count = Math.max(4, Math.round(width / 0.15));
  const pw = width / count;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const shade = 0.8 + ((Math.sin((i + 1) * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1 * 0.3;
    parts.push(tinted(blk(pw - 0.008, h - 0.02 * (i % 2), T * 0.7, pw * (i + 0.5), h / 2, 0), new THREE.Color(shade, shade * 0.97, shade * 0.93)));
  }
  // Ledges and braces on the inner face (−z).
  const inner = -(T * 0.35 + 0.02);
  const ledges = [0.3, h / 2, h - 0.3];
  for (const y of ledges) parts.push(tinted(blk(width - 0.06, 0.13, 0.04, width / 2, y, inner), '#c9b79c'));
  for (let k = 0; k < 2; k += 1) {
    const y0 = ledges[k]!;
    const y1 = ledges[k + 1]!;
    const dx = width - 0.2;
    const dy = y1 - y0;
    parts.push(tinted(blk(Math.hypot(dx, dy), 0.11, 0.035, width / 2, (y0 + y1) / 2, inner, Math.atan2(dy, dx)), '#c3b196'));
  }
  // Strap hinges and studs on the outer face (+z), a ring pull on both.
  const outer = T * 0.35 + 0.006;
  const metal: THREE.BufferGeometry[] = [];
  for (const y of [0.3, h - 0.3]) {
    metal.push(blk(width * 0.72, 0.05, 0.012, width * 0.36, y, outer));
    metal.push(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8).translate(0.0, y, 0));
    for (let x = 0.15; x < width * 0.7; x += 0.18) metal.push(new THREE.SphereGeometry(0.014, 6, 4).translate(x, y, outer + 0.008));
  }
  metal.push(
    ...bothFaces((face) => [
      new THREE.TorusGeometry(0.05, 0.008, 6, 14).translate(width - 0.14, 1.0, face * (T * 0.35 + 0.03)),
      new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8).rotateX(Math.PI / 2).translate(width - 0.14, 1.05, face * (T * 0.35 + 0.015)),
    ]),
  );
  return { leaf: [mesh(joinTextured(parts), woodMaterial())], metal, brass: [] };
}

function steelDoor(width: number): { leaf: THREE.Mesh[]; metal: THREE.BufferGeometry[]; brass: THREE.BufferGeometry[] } {
  const h = DOOR_HEIGHT;
  const plate = new THREE.Color('#7c8274');
  const parts: THREE.BufferGeometry[] = [tinted(blk(width, h, T, width / 2, h / 2, 0), plate)];
  const metal: THREE.BufferGeometry[] = [];
  // Stiffening frame and rivets on both faces, a lever handle.
  for (const face of [1, -1]) {
    const z = face * (T / 2 + 0.012);
    for (const [w, hh, x, y] of [
      [width, 0.08, width / 2, 0.04],
      [width, 0.08, width / 2, h - 0.04],
      [width, 0.08, width / 2, h / 2],
      [0.08, h, 0.04, h / 2],
      [0.08, h, width - 0.04, h / 2],
    ] as const) {
      parts.push(tinted(blk(w, hh, 0.024, x, y, z), plate.clone().multiplyScalar(0.85)));
    }
    for (const y of [0.04, h / 2, h - 0.04]) for (let x = 0.12; x < width - 0.08; x += 0.16) metal.push(new THREE.SphereGeometry(0.016, 6, 4).translate(x, y, face * (T / 2 + 0.026)));
    metal.push(blk(0.18, 0.035, 0.035, width - 0.2, 1.05, face * (T / 2 + 0.06)));
    metal.push(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8).rotateX(Math.PI / 2).translate(width - 0.12, 1.05, face * (T / 2 + 0.03)));
  }
  return { leaf: [mesh(joinTextured(parts), steelMaterial())], metal, brass: [] };
}

/** Hasp, staple and padlock near the latch edge, on both faces. */
function padlock(width: number): THREE.Group {
  const group = new THREE.Group();
  const iron = joinPlain(
    bothFaces((face) => [
      blk(0.2, 0.05, 0.012, width - 0.12, 1.3, face * (T / 2 + 0.008)),
      new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI).translate(width - 0.04, 1.27, face * (T / 2 + 0.03)),
    ]),
  );
  const body = joinPlain(bothFaces((face) => [blk(0.07, 0.07, 0.03, width - 0.04, 1.22, face * (T / 2 + 0.03))]));
  group.add(mesh(iron, ironMaterial()), mesh(body, brassMaterial()));
  return group;
}

/** A complete door leaf for a building kind; `seed` varies the paint and planks per door. */
export function buildDoor(style: DoorStyle, width: number, seed: number): DoorModel {
  const paints = ['#4f7a62', '#4a6688', '#8c4a3a', '#7a7d72', '#6a5038', '#94402f'];
  const paint = new THREE.Color(paints[Math.abs(Math.floor(seed)) % paints.length]!);
  const built = style === 'panel' ? panelDoor(width, paint) : style === 'steel' ? steelDoor(width) : plankDoor(width, seed);
  const root = new THREE.Group();
  for (const leaf of built.leaf) root.add(leaf);
  if (built.metal.length) root.add(mesh(joinPlain(built.metal), ironMaterial()));
  if (built.brass.length) root.add(mesh(joinPlain(built.brass), brassMaterial()));
  const lock = padlock(width);
  root.add(lock);
  return { root, padlock: lock };
}
