'use client';

import type { LevelData, StructureDef, Vec2 } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { concertina, gateFrame, sandbagGeometry } from './buildings/fortifications';
import { doorHood, downpipe, downpipeEnds, facadeMatrix, gutter, KitBatch, SHUTTER_WIDTH, shutterLeaf, WINDOW, windowFrame, windowGlass, windowStone } from './buildings/pieces';
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
  // Bunkers are poured concrete: board-formed, stained and patched.
  if (s.kind === 'bunker') return { key: 'concrete-cast', tint: '#c4c0b6', scale: 2.4 };
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
  /** Instanced façade pieces (windows, shutters, stonework, downpipes). */
  kit: KitBatch[];
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
  // Kit materials: instance colours tint them, so they use no vertex colours.
  const paintMat = surfaceMaterial('planks-light', { scale: 0.7, roughness: 0.7, normalStrength: 0.4, macro: 0.2 });
  const dressedStone = surfaceMaterial('stone-wall', { scale: 1.4, tint: '#c9c4ba', normalStrength: 0.6, macro: 0.3 });
  const zincMat = surfaceMaterial('metal', { scale: 1.2, tint: '#7b8186', metalness: 0.55, roughness: 0.55 });
  const zincTinted = surfaceMaterial('metal', { scale: 1.2, tint: '#7b8186', metalness: 0.55, roughness: 0.55, vertexColors: true });
  const kit = {
    glassLit: new KitBatch(windowGlass(), litMat, false),
    glassDark: new KitBatch(windowGlass(), darkMat, false),
    frame: new KitBatch(windowFrame(), paintMat),
    stone: new KitBatch(windowStone(), dressedStone),
    shutter: new KitBatch(shutterLeaf(), paintMat),
    pipe: new KitBatch(downpipe(), zincMat),
  };

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
        // Kit window units: casing and glazing bars, stone sill and lintel, open louvred shutters.
        const sill = s.baseHeight + Math.min(WINDOW.sillHeight, s.height - WINDOW.height - 0.45);
        const lit = LIT_BUILDINGS.has(s.id);
        for (let t = 3; t < len - 1; t += 4) {
          if (openings.some((o) => Math.hypot(o.pos.x - at(t).x, o.pos.z - at(t).z) < 1.6)) continue;
          const m = facadeMatrix(run.a, dir, t, WALL_T / 2, sill);
          (lit ? kit.glassLit : kit.glassDark).add(m);
          kit.frame.add(m, new THREE.Color('#e4ddd0').multiplyScalar(0.92 + random() * 0.1));
          kit.stone.add(m, shade(0.95, 0.1, random));
          for (const side of [-1, 1]) {
            const offset = side * (WINDOW.width / 2 + 0.1 + SHUTTER_WIDTH / 2);
            kit.shutter.add(m.clone().multiply(new THREE.Matrix4().makeTranslation(offset, 0, 0.005)), shutter.clone().multiplyScalar(0.85 + random() * 0.25));
          }
        }
      }
      if (s.kind === 'house' || s.kind === 'office') {
        // A small pitched hood over each door.
        for (const o of openings) {
          const t = (o.pos.x - run.a.x) * dir.x + (o.pos.z - run.a.z) * dir.z;
          const off = Math.abs((o.pos.x - run.a.x) * dir.z - (o.pos.z - run.a.z) * dir.x);
          if (off > 0.3 || t <= 0 || t >= len) continue;
          const hood = doorHood(o.width).applyMatrix4(facadeMatrix(run.a, dir, t, WALL_T / 2, s.baseHeight + 2.36));
          batches.add('trim', trimMat, tinted(hood, shutter.clone().multiplyScalar(0.8)));
        }
      }
      if (bunker) {
        // Firing slit along each wall, in a stepped, splayed embrasure frame.
        const slitW = Math.min(3, len - 1);
        const slit = at(len / 2, WALL_T / 2 + 0.01);
        batches.add('glass-dark', darkMat, box(slitW, 0.22, 0.04, slit.x, s.baseHeight + 2.1, slit.z, rot));
        for (const [w, h, d, step] of [
          [slitW + 0.5, 0.75, 0.12, 0],
          [slitW + 0.25, 0.5, 0.2, 1],
        ] as const) {
          for (const dy of [1, -1]) {
            const lip = at(len / 2, WALL_T / 2 + d / 2);
            batches.add(wallId, wallMat, tinted(box(w, (h - 0.22) / 2, d, lip.x, s.baseHeight + 2.1 + dy * ((h - 0.22) / 4 + 0.11), lip.z, rot), shade(0.92 - step * 0.05, 0.04, random)));
          }
          for (const dx of [1, -1]) {
            const jamb = at(len / 2 + dx * (slitW / 2 + (w - slitW) / 4), WALL_T / 2 + d / 2);
            batches.add(wallId, wallMat, tinted(box((w - slitW) / 2, 0.22, d, jamb.x, s.baseHeight + 2.1, jamb.z, rot), shade(0.9, 0.04, random)));
          }
        }
      }
    }

    // Quoins: dressed corner stones in alternating courses on plastered and brick houses.
    if (wall.key === 'plaster' || s.material === 'brick') {
      for (const [cx, cz, sx, sz] of [
        [min.x, min.z, -1, -1],
        [max.x, min.z, 1, -1],
        [max.x, max.z, 1, 1],
        [min.x, max.z, -1, 1],
      ] as const) {
        for (let course = 0, y = s.baseHeight + 0.55; y + 0.3 <= s.baseHeight + s.height; course += 1, y += 0.32) {
          const [la, lb] = course % 2 ? [0.5, 0.28] : [0.28, 0.5];
          const colour = shade(0.9, 0.12, random);
          batches.add('stone', stoneMat, tinted(box(la, 0.3, 0.05, cx + sx * (WALL_T / 2 - la / 2 + 0.02), y + 0.15, cz + sz * (WALL_T / 2 + 0.02)), colour));
          batches.add('stone', stoneMat, tinted(box(0.05, 0.3, lb, cx + sx * (WALL_T / 2 + 0.02), y + 0.15, cz + sz * (WALL_T / 2 - lb / 2 + 0.02)), colour));
        }
      }
    }
    // Downpipes at two opposite corners of pitched roofs, on the eave walls.
    if (s.roof === 'gable') {
      const eaveAlongX = s.size.x >= s.size.z;
      runs.forEach((run, k) => {
        const len = Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z);
        const dir = { x: (run.b.x - run.a.x) / len, z: (run.b.z - run.a.z) / len };
        const alongX = Math.abs(dir.x) > 0.5;
        if (alongX !== eaveAlongX) return;
        const t = k < 2 ? 0.35 : len - 0.35;
        const height = s.height - 0.05;
        kit.pipe.add(facadeMatrix(run.a, dir, t, WALL_T / 2, s.baseHeight, new THREE.Vector3(1, height, 1)));
        batches.add('zinc', zincTinted, tinted(downpipeEnds(height).applyMatrix4(facadeMatrix(run.a, dir, t, WALL_T / 2, s.baseHeight)), '#ffffff'));
      });
    }

    // ── Roof (hidden by the cutaway when a squad member is inside) ──────────────────────
    const roofParts: THREE.BufferGeometry[] = [];
    const gableParts: THREE.BufferGeometry[] = [];
    const extraParts: THREE.BufferGeometry[] = [];
    const gutterParts: THREE.BufferGeometry[] = [];
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
      // Ridge capped with half-round tiles.
      const ridgeLength = length + overhang * 2 + 0.05;
      const tiles = Math.max(1, Math.round(ridgeLength / 0.42));
      for (let k = 0; k < tiles; k += 1) {
        const tile = new THREE.CylinderGeometry(0.14, 0.14, ridgeLength / tiles + 0.02, 8, 1, false, -Math.PI / 2, Math.PI);
        tile.rotateZ(Math.PI / 2);
        tile.translate(-ridgeLength / 2 + (k + 0.5) * (ridgeLength / tiles), top + rise + 0.04, 0);
        if (!alongX) tile.rotateY(Math.PI / 2);
        tile.translate(s.pos.x, 0, s.pos.z);
        extraParts.push(tinted(tile, shade(0.62, 0.08, random)));
      }
      // Gutters along both eaves.
      for (const side of [1, -1]) {
        const g = gutter().scale(length + overhang * 2, 1, 1);
        g.translate(0, top - eaveDrop - 0.05, side * (run + 0.03));
        if (!alongX) g.rotateY(Math.PI / 2);
        g.translate(s.pos.x, 0, s.pos.z);
        gutterParts.push(tinted(g, '#ffffff'));
      }
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
        // Brick stack with an oversailing course, a cap and two clay pots.
        const cx = (hash2(Math.round(s.pos.x), Math.round(s.pos.z), 3) > 0.5 ? 1 : -1) * length * 0.27;
        const brick = new THREE.Color('#a87560').multiplyScalar(0.85 + random() * 0.2);
        const stackTop = top + rise + 1.15;
        const pieces: [THREE.BufferGeometry, THREE.ColorRepresentation][] = [
          [box(0.62, stackTop - top - 0.25, 0.62, cx, (stackTop + top + 0.25) / 2, 0.2), brick],
          [box(0.74, 0.1, 0.74, cx, stackTop - 0.22, 0.2), brick.clone().multiplyScalar(0.9)],
          [box(0.76, 0.1, 0.76, cx, stackTop + 0.05, 0.2), '#8a8580'],
        ];
        for (const dx of [-0.15, 0.15]) {
          pieces.push([new THREE.CylinderGeometry(0.075, 0.1, 0.36, 10).translate(cx + dx, stackTop + 0.28, 0.2), '#a3573a']);
          pieces.push([new THREE.CylinderGeometry(0.095, 0.095, 0.05, 10).translate(cx + dx, stackTop + 0.47, 0.2), '#934e34']);
        }
        for (const [g, colour] of pieces) {
          if (!alongX) g.rotateY(Math.PI / 2);
          g.translate(s.pos.x, 0, s.pos.z);
          extraParts.push(tinted(g, colour));
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
    const roofKey: SurfaceKey = s.roof === 'gable' ? (hash2(Math.round(s.pos.x), 3, 11) > 0.7 ? 'roof-clay' : 'roof-slate') : bunker ? 'concrete-cast' : s.material === 'stone' ? 'concrete' : 'planks';
    if (bunker) {
      // Ventilation stack with a cowl, and a periscope housing on the roof slab.
      const roofTop = top + 0.65;
      extraParts.push(tinted(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 10).translate(s.pos.x - s.size.x * 0.25, roofTop + 0.45, s.pos.z + s.size.z * 0.2), '#6f736e'));
      extraParts.push(tinted(new THREE.CylinderGeometry(0.24, 0.16, 0.18, 10).translate(s.pos.x - s.size.x * 0.25, roofTop + 0.95, s.pos.z + s.size.z * 0.2), '#5f635e'));
      extraParts.push(tinted(box(0.5, 0.35, 0.5, s.pos.x + s.size.x * 0.2, roofTop + 0.17, s.pos.z - s.size.z * 0.15), '#9b978f'));
      extraParts.push(tinted(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8).translate(s.pos.x + s.size.x * 0.2, roofTop + 0.6, s.pos.z - s.size.z * 0.15), '#3e4140'));
    }
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
    const gutters = merge(gutterParts);
    if (gutters) parts.push({ geometry: gutters, material: zincTinted });
    roofs.push({ regionId: s.regionId ?? 0, parts });
  }
  return { batches: batches.build(), roofs, kit: Object.values(kit).filter((k) => k.matrices.length > 0) };
}

interface Fortifications {
  batches: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  bags: { matrix: THREE.Matrix4; color: THREE.Color }[];
  fencePanels: THREE.BufferGeometry | null;
}

/** Hessian weathers unevenly: fresh, sun-bleached, damp and muddy bags side by side. */
const BAG_TONES = ['#d2bd92', '#bfa77c', '#a99470', '#c9b89a', '#8f7d5f'];

function buildFortifications(level: LevelData): Fortifications {
  const batches = new Batches();
  const bags: Fortifications['bags'] = [];
  const panels: THREE.BufferGeometry[] = [];
  const random = prng(level.seed ^ 0xf0f7);
  const timber = surfaceMaterial('planks', { scale: 1.6, vertexColors: true, roughness: 0.8 });
  const concrete = surfaceMaterial('concrete', { scale: 2.5, vertexColors: true, tint: '#b9b6ae' });
  const castConcrete = surfaceMaterial('concrete-cast', { scale: 2.2, vertexColors: true, tint: '#c9c6bd', moss: 0.15 });
  const wire = surfaceMaterial('metal', { scale: 0.6, vertexColors: true, tint: '#8e9397', metalness: 0.75, roughness: 0.4 });
  const corrugated = surfaceMaterial('corrugated', { scale: 1.1, vertexColors: true, metalness: 0.4, roughness: 0.6 });
  const iron = surfaceMaterial('metal', { scale: 1, vertexColors: true, tint: '#3f4245', metalness: 0.5, roughness: 0.6 });
  const railSteel = surfaceMaterial('metal', { scale: 1, tint: '#5b5550', metalness: 0.8, roughness: 0.35 });
  const bag = (x: number, y: number, z: number, rotY: number) => {
    // Each bag a little different in size, angle and weathering; tied ends face either way.
    const flip = random() < 0.5 ? Math.PI : 0;
    const k = 0.93 + random() * 0.14;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 0.05, rotY + flip + (random() - 0.5) * 0.16, (random() - 0.5) * 0.05)),
      new THREE.Vector3(k, 0.95 + random() * 0.1, k),
    );
    const color = new THREE.Color(BAG_TONES[Math.floor(random() * BAG_TONES.length)]!).multiplyScalar(0.92 + random() * 0.16);
    bags.push({ matrix: m, color });
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
      const out = { x: dir.z, z: -dir.x };
      for (const piece of wallPieces({ a, b }, (s.doors ?? []).map((pos) => ({ pos, width: 3.6 })))) {
        if (piece.door) {
          // Gate: heavy posts either side and two chain-link leaves standing open.
          const width = piece.to - piece.from;
          const leafW = width / 2 - 0.08;
          const leafH = s.height * 0.95;
          for (const [t, closedDir] of [
            [piece.from, 1],
            [piece.to, -1],
          ] as const) {
            const hx = a.x + dir.x * t;
            const hz = a.z + dir.z * t;
            batches.add('concrete', concrete, tinted(box(0.24, s.height + 0.35, 0.24, hx, s.baseHeight + (s.height + 0.35) / 2, hz), shade(0.9, 0.08, random)));
            // Swung open by 70°, out of the compound.
            const swing = 70 * (Math.PI / 180);
            const vx = closedDir * dir.x * Math.cos(swing) + out.x * Math.sin(swing);
            const vz = closedDir * dir.z * Math.cos(swing) + out.z * Math.sin(swing);
            const leafRot = -Math.atan2(vz, vx);
            const place = (g: THREE.BufferGeometry) => g.rotateY(leafRot).translate(hx + vx * 0.14, s.baseHeight + 0.04, hz + vz * 0.14);
            for (const tube of gateFrame(leafW, leafH)) batches.add('wire', wire, tinted(place(tube), '#ffffff'));
            const leaf = new THREE.PlaneGeometry(leafW, leafH - 0.1);
            const luv = leaf.attributes.uv as THREE.BufferAttribute;
            for (let i = 0; i < luv.count; i += 1) luv.setXY(i, luv.getX(i) * leafW, luv.getY(i) * (leafH - 0.1));
            leaf.translate(leafW / 2, leafH / 2, 0);
            panels.push(place(leaf));
          }
          continue;
        }
        const mid = (piece.from + piece.to) / 2;
        const mx = a.x + dir.x * mid;
        const mz = a.z + dir.z * mid;
        // Concertina wire coiled along the top, between the cranked arms.
        const coil = concertina(piece.to - piece.from, 0.26);
        coil.rotateY(rot);
        coil.translate(a.x + dir.x * piece.from + out.x * 0.12, s.baseHeight + s.height + 0.14, a.z + dir.z * piece.from + out.z * 0.12);
        batches.add('wire', wire, tinted(coil, '#ffffff'));
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
      const floor = new THREE.CylinderGeometry(r - 0.15, r, 0.16, 20);
      floor.translate(s.pos.x, s.baseHeight + 0.08, s.pos.z);
      batches.add('cast', castConcrete, tinted(floor, shade(0.9, 0.05, random)));
      // Holdfast ring for the gun and a low cast curb inside the sandbags, open at the rear.
      const ring = new THREE.TorusGeometry(1.1, 0.06, 6, 28).rotateX(Math.PI / 2).translate(s.pos.x, s.baseHeight + 0.17, s.pos.z);
      batches.add('iron', iron, tinted(ring, '#ffffff'));
      for (let k = 0; k < 20; k += 1) {
        const seg = Math.floor(k / 2);
        if (seg === 2 || seg === 3) continue;
        const ang = ((k + 0.5) / 20) * Math.PI * 2;
        const curb = box(0.3, 0.3, (2 * Math.PI * (r - 0.55)) / 20, 0, 0, 0);
        curb.rotateY(-ang);
        curb.translate(s.pos.x + Math.cos(ang) * (r - 0.55), s.baseHeight + 0.3, s.pos.z + Math.sin(ang) * (r - 0.55));
        batches.add('cast', castConcrete, tinted(curb, shade(0.85, 0.06, random)));
      }
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
      // Concrete footings under the legs.
      for (const [dx, dz] of legs) batches.add('cast', castConcrete, tinted(box(0.5, 0.3, 0.5, s.pos.x + dx, s.baseHeight + 0.1, s.pos.z + dz), shade(0.85, 0.08, random)));
      for (let i = 0; i < 12; i += 1) {
        batches.add('timber', timber, tinted(box(3.3, 0.08, 0.26, s.pos.x, s.baseHeight + 5.1, s.pos.z - 1.55 + i * 0.28), shade(0.95, 0.25, random)));
      }
      // Parapet: a top rail and vertical cladding boards (with gaps) on each side.
      for (const [dx, dz, alongX] of [
        [0, -1.6, true],
        [0, 1.6, true],
        [-1.6, 0, false],
        [1.6, 0, false],
      ] as const) {
        const rail = alongX ? box(3.4, 0.08, 0.12, s.pos.x + dx, s.baseHeight + 6.08, s.pos.z + dz) : box(0.12, 0.08, 3.4, s.pos.x + dx, s.baseHeight + 6.08, s.pos.z + dz);
        batches.add('timber', timber, tinted(rail, shade(0.7, 0.1, random)));
        for (let u = -1.5; u <= 1.5; u += 0.19) {
          const board = alongX ? box(0.16, 0.9, 0.04, s.pos.x + u, s.baseHeight + 5.6, s.pos.z + dz) : box(0.04, 0.9, 0.16, s.pos.x + dx, s.baseHeight + 5.6, s.pos.z + u);
          batches.add('timber', timber, tinted(board, shade(0.85, 0.22, random)));
        }
      }
      // Corner posts carry a corrugated-iron hip roof.
      for (const [dx, dz] of [
        [-1.55, -1.55],
        [1.55, -1.55],
        [1.55, 1.55],
        [-1.55, 1.55],
      ] as const) {
        batches.add('timber', timber, tinted(box(0.12, 1.75, 0.12, s.pos.x + dx, s.baseHeight + 6.0, s.pos.z + dz), shade(0.7, 0.1, random)));
      }
      const roof = new THREE.ConeGeometry(2.75, 1.1, 4, 1, true);
      roof.rotateY(Math.PI / 4);
      roof.translate(s.pos.x, s.baseHeight + 7.42, s.pos.z);
      batches.add('corrugated', corrugated, tinted(roof, shade(0.85, 0.1, random)));
      batches.add('timber', timber, tinted(box(3.6, 0.1, 3.6, s.pos.x, s.baseHeight + 6.86, s.pos.z), shade(0.6, 0.08, random)));
      for (let y = 0.4; y < 5.1; y += 0.35) batches.add('timber', timber, tinted(box(0.06, 0.06, 0.55, s.pos.x + 1.32, s.baseHeight + y, s.pos.z), new THREE.Color('#6d5a44')));
      for (const side of [-0.28, 0.28]) batches.add('timber', timber, tinted(box(0.07, 5.3, 0.07, s.pos.x + 1.32, s.baseHeight + 2.65, s.pos.z + side), new THREE.Color('#6d5a44')));
    } else if (s.kind === 'rail' && s.path && s.path.length >= 2) {
      // Two steel rails on timber sleepers (the ballast is the gravel surface).
      const a = s.path[0]!;
      const b = s.path[1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const rot = -Math.atan2(b.z - a.z, b.x - a.x);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      for (const side of [-0.72, 0.72]) {
        const rail = box(len, 0.12, 0.08, 0, s.baseHeight + 0.2, side);
        rail.rotateY(rot);
        rail.translate(mid.x, 0, mid.z);
        batches.add('rail', railSteel, rail);
      }
      for (let u = -len / 2 + 0.3; u < len / 2; u += 0.65) {
        const sleeper = box(0.24, 0.12, 2.3, u, s.baseHeight + 0.08, 0);
        sleeper.rotateY(rot);
        sleeper.translate(mid.x, 0, mid.z);
        batches.add('timber', timber, tinted(sleeper, shade(0.6, 0.15, random)));
      }
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

/** One kit piece drawn for every placement (one draw call per piece type). */
function KitInstances({ batch }: { batch: KitBatch }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    batch.matrices.forEach((matrix, i) => {
      m.setMatrixAt(i, matrix);
      m.setColorAt(i, batch.colors[i]!);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [batch]);
  return <instancedMesh ref={mesh} args={[batch.geometry, batch.material, batch.matrices.length]} castShadow={batch.shadow} receiveShadow />;
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
  const bagMaterial = useMemo(() => surfaceMaterial('hessian', { scale: 0.3, roughness: 1, macro: 0.4, normalStrength: 1.4 }), []);
  const fenceMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ map: chainLinkTexture(), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: '#9aa0a4' }),
    [],
  );
  const bagMesh = useRef<THREE.InstancedMesh>(null);
  const roofRefs = useRef<(THREE.Group | null)[]>([]);

  useLayoutEffect(() => {
    const mesh = bagMesh.current;
    if (!mesh) return;
    forts.bags.forEach(({ matrix, color }, i) => {
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
      {buildings.kit.map((batch, i) => (
        <KitInstances key={`k${i}`} batch={batch} />
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
