'use client';

import type { LevelData, StructureDef, Vec2 } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, merge, shade, tinted } from './geom';
import { surfaceMaterial, withMetreUvs } from './materials/surface';
import type { SurfaceKey } from './materials/textures';
import { hash2, prng } from './noise';

const BUILDING_KINDS = new Set(['house', 'office', 'warehouse', 'barracks', 'bunker', 'radio-hut']);
const WALL_T = 0.32;
const LIT_BUILDINGS = new Set(['house-1', 'house-3', 'office', 'house-5', 'barracks']);
const PLASTER_TINTS = ['#ece6da', '#e2cfa6', '#cfd6d4', '#e6d6c3', '#d8d0bd'];
const SHUTTER_TINTS = ['#3f5c4a', '#3d5068', '#6e3b2f', '#585a52', '#4a3b2c'];

interface WallRun {
  a: Vec2;
  b: Vec2;
}

function doorWidthAt(level: LevelData, pos: Vec2): number {
  const fixture = level.fixtures.find((f) => f.type === 'door' && Math.abs(f.pos.x - pos.x) < 0.01 && Math.abs(f.pos.z - pos.z) < 0.01);
  return fixture && fixture.type === 'door' ? (fixture.width ?? 1.2) : 1.2;
}

/** Splits a straight wall into solid pieces around door openings. */
function wallPieces(run: WallRun, openings: { pos: Vec2; width: number }[]): { from: number; to: number; door: boolean }[] {
  const len = Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z);
  const dir = { x: (run.b.x - run.a.x) / len, z: (run.b.z - run.a.z) / len };
  const cuts = openings
    .map((o) => {
      const t = (o.pos.x - run.a.x) * dir.x + (o.pos.z - run.a.z) * dir.z;
      const off = Math.abs((o.pos.x - run.a.x) * dir.z - (o.pos.z - run.a.z) * dir.x);
      return off < 0.3 && t > 0 && t < len ? { from: t - o.width / 2, to: t + o.width / 2 } : null;
    })
    .filter((c): c is { from: number; to: number } => c !== null)
    .sort((p, q) => p.from - q.from);
  const pieces: { from: number; to: number; door: boolean }[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.from > cursor) pieces.push({ from: cursor, to: cut.from, door: false });
    pieces.push({ from: cut.from, to: cut.to, door: true });
    cursor = cut.to;
  }
  if (cursor < len) pieces.push({ from: cursor, to: len, door: false });
  return pieces;
}

/** Geometry collected per material, merged into one mesh each. */
class Batches {
  readonly parts = new Map<string, { material: THREE.Material; list: THREE.BufferGeometry[] }>();
  add(id: string, material: THREE.Material, geometry: THREE.BufferGeometry): void {
    const entry = this.parts.get(id) ?? { material, list: [] };
    entry.list.push(geometry);
    this.parts.set(id, entry);
  }
  build(): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
    return [...this.parts.values()].flatMap(({ material, list }) => {
      const geometry = merge(list);
      return geometry ? [{ geometry, material }] : [];
    });
  }
}

/** Separate batches for UV-mapped parts (roof tiles), which keep their `uvMetres` attribute. */
function mergeUv(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (list.length === 0) return null;
  const prepared = list.map((g) => {
    const geometry = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(geometry.attributes)) {
      if (!['position', 'normal', 'uvMetres', 'color'].includes(name)) geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.color) tinted(geometry, '#ffffff');
    return geometry;
  });
  const total = prepared.reduce((n, g) => n + g.attributes.position!.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uvMetres', 'color'] as const) {
    const size = name === 'uvMetres' ? 2 : 3;
    const data = new Float32Array(total * size);
    let offset = 0;
    for (const g of prepared) {
      data.set((g.attributes[name] as THREE.BufferAttribute).array as Float32Array, offset);
      offset += g.attributes.position!.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  return out;
}

function wallSurface(s: StructureDef): { key: SurfaceKey; tint: string; scale: number } {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(hash2(Math.round(s.pos.x * 10), Math.round(s.pos.z * 10), 5) * list.length)]!;
  switch (s.material) {
    case 'stone':
      return { key: 'stone-wall', tint: '#dcd9d2', scale: 2.4 };
    case 'brick':
      return { key: 'stone-wall', tint: '#b68a73', scale: 1.8 };
    case 'timber':
      return { key: 'planks', tint: '#b9b1a6', scale: 2.2 };
    case 'wood':
      return { key: 'planks-light', tint: '#b7a58c', scale: 2 };
    case 'concrete':
      return { key: 'concrete', tint: '#c7c4bc', scale: 3 };
    case 'metal':
      return { key: 'metal', tint: '#80868b', scale: 2 };
    default:
      return { key: 'plaster', tint: pick(PLASTER_TINTS), scale: 2.6 };
  }
}

interface RoofGroup {
  regionId: number;
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
}

interface BuildingMeshes {
  batches: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  roofs: RoofGroup[];
}

const glassLit = () => new THREE.MeshStandardMaterial({ color: '#3a2a16', emissive: new THREE.Color('#ffb05a'), emissiveIntensity: 2.6, roughness: 0.3 });
const glassDark = () => new THREE.MeshStandardMaterial({ color: '#10161c', roughness: 0.12, metalness: 0.3 });

function buildBuildings(level: LevelData): BuildingMeshes {
  const batches = new Batches();
  const roofs: RoofGroup[] = [];
  const random = prng(level.seed ^ 0xb11d);
  const stoneMat = surfaceMaterial('stone-wall', { scale: 2.2, vertexColors: true, tint: '#a8a49c', moss: 0.2 });
  const trimMat = surfaceMaterial('planks-light', { scale: 1.2, vertexColors: true, roughness: 0.8 });
  const litMat = glassLit();
  const darkMat = glassDark();

  for (const s of level.structures) {
    if (!BUILDING_KINDS.has(s.kind)) continue;
    const min = { x: s.pos.x - s.size.x / 2, z: s.pos.z - s.size.z / 2 };
    const max = { x: s.pos.x + s.size.x / 2, z: s.pos.z + s.size.z / 2 };
    const runs: WallRun[] = [
      { a: min, b: { x: max.x, z: min.z } },
      { a: { x: max.x, z: min.z }, b: max },
      { a: max, b: { x: min.x, z: max.z } },
      { a: { x: min.x, z: max.z }, b: min },
    ];
    const openings = (s.doors ?? []).map((pos) => ({ pos, width: doorWidthAt(level, pos) }));
    const wall = wallSurface(s);
    const wallMat = surfaceMaterial(wall.key, { scale: wall.scale, tint: wall.tint, vertexColors: true, moss: wall.key === 'plaster' ? 0.15 : 0.1, macro: 0.45 });
    const wallId = `wall:${wall.key}:${wall.tint}`;
    const plinth = wall.key === 'plaster' || wall.key === 'planks' || wall.key === 'planks-light';
    const shutter = new THREE.Color(SHUTTER_TINTS[Math.floor(hash2(Math.round(s.pos.x), Math.round(s.pos.z), 9) * SHUTTER_TINTS.length)]!);
    const hasWindows = s.kind === 'house' || s.kind === 'office' || s.kind === 'barracks';
    const bunker = s.kind === 'bunker';

    for (const run of runs) {
      const len = Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z);
      const dir = { x: (run.b.x - run.a.x) / len, z: (run.b.z - run.a.z) / len };
      const out = { x: dir.z, z: -dir.x };
      const rot = -Math.atan2(dir.z, dir.x);
      const at = (t: number, off = 0) => ({ x: run.a.x + dir.x * t + out.x * off, z: run.a.z + dir.z * t + out.z * off });
      for (const piece of wallPieces(run, openings)) {
        const mid = (piece.from + piece.to) / 2;
        const c = at(mid);
        const plen = piece.to - piece.from;
        if (piece.door) {
          const lintel = 2.25;
          batches.add(wallId, wallMat, tinted(box(plen, s.height - lintel, WALL_T, c.x, s.baseHeight + lintel + (s.height - lintel) / 2, c.z, rot), shade(1, 0.06, random)));
          // Frame, and a stone step outside.
          for (const side of [-1, 1]) {
            const j = at(mid + side * (plen / 2 + 0.06), 0.06);
            batches.add('trim', trimMat, tinted(box(0.12, 2.3, WALL_T + 0.12, j.x, s.baseHeight + 1.15, j.z, rot), new THREE.Color('#5d4c3a')));
          }
          const head = at(mid, 0.06);
          batches.add('trim', trimMat, tinted(box(plen + 0.36, 0.14, WALL_T + 0.12, head.x, s.baseHeight + 2.3, head.z, rot), new THREE.Color('#5d4c3a')));
          const step = at(mid, WALL_T / 2 + 0.3);
          batches.add('stone', stoneMat, tinted(box(plen + 0.4, 0.16, 0.6, step.x, s.baseHeight + 0.02, step.z, rot), shade(0.9, 0.1, random)));
        } else {
          batches.add(wallId, wallMat, tinted(box(plen + WALL_T * 0.5, s.height, WALL_T, c.x, s.baseHeight + s.height / 2, c.z, rot), shade(1, 0.06, random)));
          if (plinth) {
            const p = at(mid, 0.04);
            batches.add('stone', stoneMat, tinted(box(plen + WALL_T * 0.5 + 0.08, 0.55, WALL_T + 0.1, p.x, s.baseHeight + 0.2, p.z, rot), shade(0.85, 0.1, random)));
          }
        }
      }
      if (hasWindows) {
        for (let t = 3; t < len - 1; t += 4) {
          if (openings.some((o) => Math.hypot(o.pos.x - at(t).x, o.pos.z - at(t).z) < 1.6)) continue;
          const pane = at(t, WALL_T / 2 + 0.01);
          const y = s.baseHeight + 1.45;
          batches.add(LIT_BUILDINGS.has(s.id) ? 'glass-lit' : 'glass-dark', LIT_BUILDINGS.has(s.id) ? litMat : darkMat, box(0.9, 0.85, 0.04, pane.x, y, pane.z, rot));
          const frame = (dt: number, dy: number, w: number, h: number) => {
            const f = at(t + dt, WALL_T / 2 + 0.04);
            batches.add('trim', trimMat, tinted(box(w, h, 0.08, f.x, y + dy, f.z, rot), new THREE.Color('#e4ddd0')));
          };
          frame(-0.49, 0, 0.08, 1.0);
          frame(0.49, 0, 0.08, 1.0);
          frame(0, 0.48, 1.06, 0.08);
          frame(0, 0, 0.9, 0.05);
          const sill = at(t, WALL_T / 2 + 0.1);
          batches.add('stone', stoneMat, tinted(box(1.2, 0.08, 0.22, sill.x, y - 0.49, sill.z, rot), shade(0.95, 0.08, random)));
          for (const side of [-1, 1]) {
            const sh = at(t + side * 0.78, WALL_T / 2 + 0.05);
            batches.add('trim', trimMat, tinted(box(0.5, 0.95, 0.04, sh.x, y, sh.z, rot), shutter.clone().multiplyScalar(0.9 + random() * 0.2)));
          }
        }
      }
      if (bunker) {
        // Firing slit along the seaward walls.
        const slit = at(len / 2, WALL_T / 2 + 0.01);
        batches.add('glass-dark', darkMat, box(Math.min(3, len - 1), 0.22, 0.04, slit.x, s.baseHeight + 2.1, slit.z, rot));
      }
    }

    // ── Roof (hidden by the cutaway when a squad member is inside) ──────────────────────
    const roofParts: THREE.BufferGeometry[] = [];
    const gableParts: THREE.BufferGeometry[] = [];
    const extraParts: THREE.BufferGeometry[] = [];
    const top = s.baseHeight + s.height;
    if (s.roof === 'gable') {
      const alongX = s.size.x >= s.size.z;
      const length = alongX ? s.size.x : s.size.z;
      const span = alongX ? s.size.z : s.size.x;
      const rise = s.kind === 'warehouse' ? 1.9 : 1.6;
      const overhang = 0.45;
      const half = span / 2;
      const slope = rise / half;
      const eaveDrop = overhang * slope;
      const run = half + overhang;
      const dy = rise + eaveDrop;
      const slabLen = Math.hypot(run, dy);
      const theta = Math.atan2(dy, run);
      const thick = 0.14;
      for (const side of [1, -1]) {
        const slab = withMetreUvs(new THREE.BoxGeometry(length + overhang * 2, thick, slabLen));
        slab.rotateX(side * theta);
        // Centre of the slab: midway between the ridge and the eave, lifted half its thickness.
        const cz = (side * run) / 2;
        const cy = top + rise - dy / 2;
        const nx = Math.cos(theta);
        slab.translate(0, cy + (thick / 2) * nx, cz + side * (thick / 2) * Math.sin(theta));
        if (!alongX) slab.rotateY(Math.PI / 2);
        slab.translate(s.pos.x, 0, s.pos.z);
        roofParts.push(slab);
      }
      const ridge = box(length + overhang * 2 + 0.05, 0.16, 0.26, 0, top + rise + 0.07, 0);
      if (!alongX) ridge.rotateY(Math.PI / 2);
      ridge.translate(s.pos.x, 0, s.pos.z);
      extraParts.push(tinted(ridge, new THREE.Color('#6d6a66')));
      // Gable-end triangles in the wall material.
      for (const end of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(-half, 0);
        shape.lineTo(half, 0);
        shape.lineTo(0, rise);
        shape.closePath();
        const tri = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false });
        tri.translate(0, 0, -WALL_T / 2);
        tri.rotateY(Math.PI / 2);
        tri.translate((end * (length - WALL_T)) / 2, top, 0);
        if (!alongX) tri.rotateY(Math.PI / 2);
        tri.translate(s.pos.x, 0, s.pos.z);
        gableParts.push(tinted(tri, shade(1, 0.06, random)));
      }
      if (s.kind === 'house' || s.kind === 'office') {
        const cx = (hash2(Math.round(s.pos.x), Math.round(s.pos.z), 3) > 0.5 ? 1 : -1) * length * 0.27;
        const chimney = box(0.62, rise + 1.1, 0.62, cx, top + (rise + 1.1) / 2 + 0.25, 0.2);
        const cap = box(0.78, 0.12, 0.78, cx, top + rise + 1.4, 0.2);
        for (const g of [chimney, cap]) {
          if (!alongX) g.rotateY(Math.PI / 2);
          g.translate(s.pos.x, 0, s.pos.z);
          extraParts.push(tinted(g, shade(0.8, 0.1, random)));
        }
      }
    } else {
      const thick = bunker ? 0.65 : 0.32;
      const slab = box(s.size.x + (bunker ? 0.6 : 0.4), thick, s.size.z + (bunker ? 0.6 : 0.4), s.pos.x, top + thick / 2, s.pos.z);
      roofParts.push(slab);
      if (!bunker) {
        for (const [w, d, dx, dz] of [
          [s.size.x + 0.4, 0.16, 0, (s.size.z + 0.4) / 2],
          [s.size.x + 0.4, 0.16, 0, -(s.size.z + 0.4) / 2],
          [0.16, s.size.z + 0.4, (s.size.x + 0.4) / 2, 0],
          [0.16, s.size.z + 0.4, -(s.size.x + 0.4) / 2, 0],
        ] as const) {
          extraParts.push(tinted(box(w, 0.22, d, s.pos.x + dx, top + thick + 0.11, s.pos.z + dz), new THREE.Color('#8f8a82')));
        }
      }
    }
    const roofKey: SurfaceKey = s.roof === 'gable' ? (hash2(Math.round(s.pos.x), 3, 11) > 0.7 ? 'roof-clay' : 'roof-slate') : bunker || s.material === 'stone' ? 'concrete' : 'planks';
    const roofMat = surfaceMaterial(roofKey, {
      scale: roofKey.startsWith('roof') ? 2.2 : 2.6,
      projection: s.roof === 'gable' ? 'uv' : 'triplanar',
      vertexColors: true,
      tint: roofKey === 'concrete' ? '#a9a69e' : '#ffffff',
      moss: 0.3,
      roughness: 0.75,
    });
    const parts: RoofGroup['parts'] = [];
    const roofGeometry = s.roof === 'gable' ? mergeUv(roofParts) : merge(roofParts);
    if (roofGeometry) parts.push({ geometry: roofGeometry, material: roofMat });
    const gables = merge(gableParts);
    if (gables) parts.push({ geometry: gables, material: wallMat });
    const extras = merge(extraParts);
    if (extras) parts.push({ geometry: extras, material: stoneMat });
    roofs.push({ regionId: s.regionId ?? 0, parts });
  }
  return { batches: batches.build(), roofs };
}

/** Pillow-shaped sandbag (about 0.6 × 0.24 × 0.34 m). */
function sandbagGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.62, 0.24, 0.34, 4, 2, 3);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i) / 0.31;
    const y = pos.getY(i) / 0.12;
    const z = pos.getZ(i) / 0.17;
    const pinch = 1 - 0.18 * x * x;
    pos.setXYZ(i, pos.getX(i) * (1 - 0.06 * y * y), pos.getY(i) * pinch * (1 - 0.2 * z * z), pos.getZ(i) * (1 - 0.12 * y * y) * pinch);
  }
  g.computeVertexNormals();
  return g;
}

interface Fortifications {
  batches: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  bags: THREE.Matrix4[];
  fencePanels: THREE.BufferGeometry | null;
}

function buildFortifications(level: LevelData): Fortifications {
  const batches = new Batches();
  const bags: THREE.Matrix4[] = [];
  const panels: THREE.BufferGeometry[] = [];
  const random = prng(level.seed ^ 0xf0f7);
  const timber = surfaceMaterial('planks', { scale: 1.6, vertexColors: true, roughness: 0.8 });
  const concrete = surfaceMaterial('concrete', { scale: 2.5, vertexColors: true, tint: '#b9b6ae' });
  const iron = surfaceMaterial('metal', { scale: 1, vertexColors: true, tint: '#3f4245', metalness: 0.5, roughness: 0.6 });
  const slate = surfaceMaterial('roof-slate', { scale: 1.6, vertexColors: true });
  const bag = (x: number, y: number, z: number, rotY: number) => {
    const m = new THREE.Matrix4().makeRotationY(rotY + (random() - 0.5) * 0.18);
    m.setPosition(x, y, z);
    bags.push(m);
  };

  for (const s of level.structures) {
    if (s.kind === 'fence' && s.path && s.path.length >= 2) {
      const a = s.path[0]!;
      const b = s.path[1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
      const rot = -Math.atan2(dir.z, dir.x);
      const gaps = (s.doors ?? []).map((d) => (d.x - a.x) * dir.x + (d.z - a.z) * dir.z);
      for (let t = 0; t <= len + 0.01; t += 2.5) {
        if (gaps.some((g) => Math.abs(g - t) < 1.6)) continue;
        const x = a.x + dir.x * t;
        const z = a.z + dir.z * t;
        batches.add('concrete', concrete, tinted(box(0.14, s.height + 0.2, 0.14, x, s.baseHeight + (s.height + 0.2) / 2, z), shade(0.95, 0.1, random)));
        const arm = new THREE.BoxGeometry(0.05, 0.5, 0.05);
        arm.rotateX(0.6);
        arm.rotateY(rot);
        arm.translate(x, s.baseHeight + s.height + 0.38, z);
        batches.add('iron', iron, arm);
      }
      for (const piece of wallPieces({ a, b }, (s.doors ?? []).map((pos) => ({ pos, width: 3.6 })))) {
        if (piece.door) continue;
        const mid = (piece.from + piece.to) / 2;
        const mx = a.x + dir.x * mid;
        const mz = a.z + dir.z * mid;
        for (const [dy, off] of [
          [0.25, 0],
          [0.45, 0.12],
          [0.6, 0.24],
        ] as const) {
          batches.add('iron', iron, box(piece.to - piece.from, 0.025, 0.025, mx + dir.z * off, s.baseHeight + s.height + dy, mz - dir.x * off, rot));
        }
        const panel = new THREE.PlaneGeometry(piece.to - piece.from, s.height * 0.95);
        // UVs in metres so the chain-link pattern keeps its scale on every panel.
        const uv = panel.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * (piece.to - piece.from), uv.getY(i) * s.height * 0.95);
        panel.rotateY(rot);
        panel.translate(mx, s.baseHeight + s.height * 0.48, mz);
        panels.push(panel);
      }
    } else if (s.kind === 'gun-emplacement') {
      const r = s.size.x / 2;
      const floor = new THREE.CylinderGeometry(r - 0.15, r, 0.16, 10);
      floor.rotateY(Math.PI / 10);
      floor.translate(s.pos.x, s.baseHeight + 0.08, s.pos.z);
      batches.add('concrete', concrete, tinted(floor, shade(0.9, 0.05, random)));
      // Three courses of sandbags around the ring, leaving the rear entrance open.
      for (let course = 0; course < 4; course += 1) {
        const ringR = r - 0.05 - course * 0.04;
        const step = 0.58 / ringR;
        for (let angle = 0; angle < Math.PI * 2; angle += step) {
          const seg = Math.floor(((angle / (Math.PI * 2)) * 10) % 10);
          if (seg === 2 || seg === 3) continue;
          const offset = course % 2 === 0 ? 0 : step / 2;
          const ang = angle + offset;
          bag(s.pos.x + Math.cos(ang) * ringR, s.baseHeight + 0.14 + course * 0.23, s.pos.z + Math.sin(ang) * ringR, -ang + Math.PI / 2);
        }
      }
    } else if (s.kind === 'watchtower') {
      const H = s.height;
      const legs = [
        [-1.2, -1.2],
        [1.2, -1.2],
        [1.2, 1.2],
        [-1.2, 1.2],
      ] as const;
      for (const [dx, dz] of legs) batches.add('timber', timber, tinted(box(0.22, H + 1.1, 0.22, s.pos.x + dx, s.baseHeight + (H + 1.1) / 2, s.pos.z + dz), shade(0.75, 0.1, random)));
      for (let k = 0; k < 4; k += 1) {
        const [ax, az] = legs[k]!;
        const [bx, bz] = legs[(k + 1) % 4]!;
        const len = Math.hypot(bx - ax, bz - az);
        const rot = -Math.atan2(bz - az, bx - ax);
        for (const [y0, sign] of [
          [1.2, 1],
          [3.2, -1],
        ] as const) {
          const brace = new THREE.BoxGeometry(Math.hypot(len, 1.9), 0.1, 0.08);
          brace.rotateZ(sign * Math.atan2(1.9, len));
          brace.rotateY(rot);
          brace.translate(s.pos.x + (ax + bx) / 2, s.baseHeight + y0, s.pos.z + (az + bz) / 2);
          batches.add('timber', timber, tinted(brace, shade(0.7, 0.1, random)));
        }
      }
      for (let i = 0; i < 12; i += 1) {
        batches.add('timber', timber, tinted(box(3.3, 0.08, 0.26, s.pos.x, s.baseHeight + 5.1, s.pos.z - 1.55 + i * 0.28), shade(0.95, 0.25, random)));
      }
      for (const [dx, dz, w, d] of [
        [0, -1.6, 3.3, 0.08],
        [0, 1.6, 3.3, 0.08],
        [-1.6, 0, 0.08, 3.3],
        [1.6, 0, 0.08, 3.3],
      ] as const) {
        batches.add('timber', timber, tinted(box(w, 0.8, d, s.pos.x + dx, s.baseHeight + 5.65, s.pos.z + dz), shade(0.85, 0.15, random)));
      }
      const roof = new THREE.ConeGeometry(2.7, 1.3, 4, 1);
      roof.rotateY(Math.PI / 4);
      roof.translate(s.pos.x, s.baseHeight + 7.45, s.pos.z);
      batches.add('slate', slate, roof);
      for (let y = 0.4; y < 5.1; y += 0.35) batches.add('timber', timber, tinted(box(0.06, 0.06, 0.55, s.pos.x + 1.32, s.baseHeight + y, s.pos.z), new THREE.Color('#6d5a44')));
      for (const side of [-0.28, 0.28]) batches.add('timber', timber, tinted(box(0.07, 5.3, 0.07, s.pos.x + 1.32, s.baseHeight + 2.65, s.pos.z + side), new THREE.Color('#6d5a44')));
    } else if (s.kind === 'sandbags') {
      const alongZ = s.size.z >= s.size.x;
      const length = Math.max(s.size.x, s.size.z);
      for (let course = 0; course < 4; course += 1) {
        for (let u = -length / 2 + 0.3 + (course % 2) * 0.3; u <= length / 2 - 0.2; u += 0.6) {
          bag(s.pos.x + (alongZ ? 0 : u), s.baseHeight + 0.12 + course * 0.23, s.pos.z + (alongZ ? u : 0), alongZ ? Math.PI / 2 : 0);
        }
      }
    }
  }
  // Panels keep their UVs (the chain-link texture is UV-mapped), so they merge as-is.
  return { batches: batches.build(), bags, fencePanels: panels.length ? mergeGeometries(panels) : null };
}

/** Diamond chain-link pattern with transparent holes (one tile per 0.5 m). */
function chainLinkTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#c7ccd0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size / 2, 0);
  ctx.lineTo(size, size / 2);
  ctx.lineTo(size / 2, size);
  ctx.closePath();
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.anisotropy = 8;
  return texture;
}

export interface StructuresProps {
  level: LevelData;
  /** Region ids whose roofs are lifted away this frame (buildings with squad members inside, hovered). */
  cutawayRegions: () => Set<number>;
}

export function Structures({ level, cutawayRegions }: StructuresProps) {
  const buildings = useMemo(() => buildBuildings(level), [level]);
  const forts = useMemo(() => buildFortifications(level), [level]);
  const bagGeometry = useMemo(() => sandbagGeometry(), []);
  const bagMaterial = useMemo(() => surfaceMaterial('plaster', { scale: 0.9, tint: '#b6a37e', roughness: 1, macro: 0.5 }), []);
  const fenceMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ map: chainLinkTexture(), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: '#9aa0a4' }),
    [],
  );
  const bagMesh = useRef<THREE.InstancedMesh>(null);
  const roofRefs = useRef<(THREE.Group | null)[]>([]);

  useLayoutEffect(() => {
    const mesh = bagMesh.current;
    if (!mesh) return;
    forts.bags.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [forts]);

  useFrame(() => {
    const hidden = cutawayRegions();
    buildings.roofs.forEach((roof, i) => {
      const group = roofRefs.current[i];
      if (group) group.visible = !hidden.has(roof.regionId);
    });
  });

  return (
    <group name="structures">
      {buildings.batches.map(({ geometry, material }, i) => (
        <mesh key={`b${i}`} geometry={geometry} material={material} castShadow receiveShadow />
      ))}
      {buildings.roofs.map((roof, i) => (
        <group
          key={`r${i}`}
          ref={(g) => {
            roofRefs.current[i] = g;
          }}
        >
          {roof.parts.map(({ geometry, material }, j) => (
            <mesh key={j} geometry={geometry} material={material} castShadow receiveShadow />
          ))}
        </group>
      ))}
      {forts.batches.map(({ geometry, material }, i) => (
        <mesh key={`f${i}`} geometry={geometry} material={material} castShadow receiveShadow />
      ))}
      {forts.bags.length > 0 && <instancedMesh ref={bagMesh} args={[bagGeometry, bagMaterial, forts.bags.length]} castShadow receiveShadow />}
      {forts.fencePanels && <mesh geometry={forts.fencePanels} material={fenceMaterial} />}
    </group>
  );
}
