import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Part } from '../assets/bake';
import { surfaceMaterial } from './materials/surface';
import { prng } from './noise';

// Trees: barked trunks with foliage built from alpha-tested cards (drooping needle branches on
// pines, leaf clusters on oaks), each a few hundred triangles so a forest instances cheaply.
// Models stand on y = 0 and face +x like every prop.

type Draw = (ctx: CanvasRenderingContext2D, random: () => number) => void;

function cardTexture(width: number, height: number, draw: Draw, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  draw(ctx, prng(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A spruce-like branch seen from above: a stem from the bottom edge with needle tufts either side. */
const drawBranch: Draw = (ctx, random) => {
  const { width: w, height: h } = ctx.canvas;
  const greens = ['#1f3a26', '#26452c', '#2f5233', '#1a3122', '#365c3a'];
  ctx.lineCap = 'round';
  for (let i = 0; i < 520; i += 1) {
    const t = random();
    const y = h * (1 - t);
    // The branch tapers to its tip; side shoots splay outwards.
    const spread = (w / 2) * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (0.6 + random() * 0.4);
    const side = random() < 0.5 ? -1 : 1;
    const x0 = w / 2 + side * random() * spread * 0.35;
    const len = 6 + random() * 16;
    const angle = side * (0.5 + random() * 0.9) - Math.PI / 2;
    ctx.strokeStyle = greens[Math.floor(random() * greens.length)]!;
    ctx.lineWidth = 1.2 + random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(Math.min(w - 2, Math.max(2, x0 + Math.cos(angle) * len * (spread / (w / 2)) * 1.6)), y + Math.sin(angle) * len * 0.6);
    ctx.stroke();
  }
  ctx.strokeStyle = '#3b2c20';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w / 2, h);
  ctx.lineTo(w / 2, h * 0.08);
  ctx.stroke();
};

/** A cluster of oak leaves in several greens. */
const drawLeaves: Draw = (ctx, random) => {
  const { width: w, height: h } = ctx.canvas;
  const greens = ['#33502a', '#3d5c2e', '#476b33', '#2a4424', '#56783a'];
  for (let i = 0; i < 260; i += 1) {
    // Denser in the middle so the card edge breaks up into single leaves.
    const r = Math.sqrt(random()) * 0.46;
    const a = random() * Math.PI * 2;
    const x = w / 2 + Math.cos(a) * r * w;
    const y = h / 2 + Math.sin(a) * r * h;
    ctx.fillStyle = greens[Math.floor(random() * greens.length)]!;
    ctx.beginPath();
    ctx.ellipse(x, y, 5 + random() * 5, 3 + random() * 3, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
};

let needleTexture: THREE.CanvasTexture | null = null;
let leafTexture: THREE.CanvasTexture | null = null;

function foliage(texture: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.92 });
}

/** A card from (0,0,0) out along +x (`length`), `width` across, lying flat; UV v runs along it. */
function card(length: number, width: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, length);
  g.rotateX(-Math.PI / 2); // flat, facing up
  g.rotateY(-Math.PI / 2); // length along +x, v increasing outwards
  g.translate(length / 2, 0, 0);
  return g;
}

/** Normals bent upwards so foliage is lit like a canopy, not like flat cards. */
function canopyNormals(g: THREE.BufferGeometry, lift = 0.75): THREE.BufferGeometry {
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i += 1) {
    v.fromBufferAttribute(n, i);
    v.multiplyScalar(1 - lift).add(new THREE.Vector3(0, lift, 0)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function joinUv(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(
    parts.map((g) => {
      const geometry = g.index ? g.toNonIndexed() : g;
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      return geometry;
    }),
  )!;
}

/** Trunk: a tapered, slightly kinked cylinder in bark. */
function trunk(height: number, r0: number, r1: number, random: () => number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, height, 9, 6, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) / height + 0.5;
    pos.setX(i, pos.getX(i) + Math.sin(y * 5 + random()) * 0.03);
  }
  g.translate(0, height / 2, 0);
  g.computeVertexNormals();
  return g;
}

/** Pine: about 8 m, whorls of drooping needle branches narrowing to a spire. */
export function pineParts(): Part[] {
  needleTexture ??= cardTexture(128, 256, drawBranch, 17);
  const random = prng(29);
  const branches: THREE.BufferGeometry[] = [];
  const top = 7.6;
  for (let h = 1.5, whorl = 0; h < top - 0.4; h += 0.56, whorl += 1) {
    const t = (h - 1.5) / (top - 1.9);
    const reach = 0.45 + 2.1 * Math.pow(1 - t, 0.85);
    const count = t > 0.75 ? 5 : 7;
    for (let k = 0; k < count; k += 1) {
      const angle = (k / count) * Math.PI * 2 + whorl * 0.7 + random() * 0.3;
      const len = reach * (0.85 + random() * 0.3);
      const b = card(len, len * 0.85);
      // Branches droop more low on the tree and tip up slightly at the top.
      b.rotateZ(-(0.18 + 0.32 * (1 - t)) - random() * 0.1);
      b.rotateY(angle);
      b.translate(0, h, 0);
      branches.push(b);
    }
  }
  // The leader: two crossed upright cards.
  for (const r of [0, Math.PI / 2]) {
    const tip = new THREE.PlaneGeometry(0.7, 1.4);
    tip.rotateY(r);
    tip.translate(0, top + 0.2, 0);
    branches.push(tip);
  }
  return [
    { geometry: trunk(top, 0.24, 0.05, random), material: surfaceMaterial('bark-pine', { scale: 1.1, roughness: 0.95 }), shadow: true },
    { geometry: canopyNormals(joinUv(branches)), material: foliage(needleTexture), shadow: true },
  ];
}

/** Oak: about 6 m, a short trunk forking into limbs under a crown of leaf clusters. */
export function oakParts(): Part[] {
  leafTexture ??= cardTexture(256, 256, drawLeaves, 31);
  const random = prng(43);
  const wood: THREE.BufferGeometry[] = [trunk(2.6, 0.34, 0.22, random)];
  const clusters: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const limb = new THREE.CylinderGeometry(0.07, 0.16, 2.2, 6);
    limb.translate(0, 1.1, 0);
    limb.rotateZ(0.65);
    limb.rotateY(a);
    limb.translate(0, 2.3, 0);
    wood.push(limb);
    clusters.push(new THREE.Vector3(Math.cos(a) * 1.5, 3.9 + random() * 0.6, -Math.sin(a) * 1.5));
  }
  for (let k = 0; k < 6; k += 1) {
    const a = random() * Math.PI * 2;
    const r = random() * 1.3;
    clusters.push(new THREE.Vector3(Math.cos(a) * r, 4.4 + random() * 1.2, Math.sin(a) * r));
  }
  const leaves: THREE.BufferGeometry[] = [];
  for (const c of clusters) {
    for (let k = 0; k < 7; k += 1) {
      const size = 1.5 + random() * 0.6;
      const q = new THREE.PlaneGeometry(size, size);
      q.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI)));
      q.translate(c.x + (random() - 0.5) * 0.9, c.y + (random() - 0.5) * 0.7, c.z + (random() - 0.5) * 0.9);
      leaves.push(q);
    }
  }
  const bark = joinUv(wood);
  bark.computeVertexNormals();
  return [
    { geometry: bark, material: surfaceMaterial('bark-oak', { scale: 1.2, roughness: 0.95 }), shadow: true },
    { geometry: canopyNormals(joinUv(leaves), 0.6), material: foliage(leafTexture), shadow: true },
  ];
}
