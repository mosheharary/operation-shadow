import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Axis-aligned box centred at (x, y, z), optionally rotated about +y. */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** Gives every vertex the same colour (shade multiplier) so differently tinted parts can merge. */
export function tinted(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const count = geometry.attributes.position!.count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) data.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geometry;
}

/** Merges geometries after normalising their attribute sets (position, normal, color). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  const prepared = parts.map((g) => {
    let geometry = g.index ? g.toNonIndexed() : g;
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (!geometry.attributes.color) geometry = tinted(geometry, '#ffffff');
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color') geometry.deleteAttribute(name);
    }
    return geometry;
  });
  return mergeGeometries(prepared);
}

/** A grey shade with slight random variation, for per-plank and per-stone tint. */
export function shade(base: number, spread: number, random: () => number): THREE.Color {
  const v = base + (random() - 0.5) * spread;
  return new THREE.Color(v, v, v);
}
