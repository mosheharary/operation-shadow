'use client';

import { CellFlag, Grid, type LevelData, Surface } from '@operation-shadow/engine';
import { useMemo } from 'react';
import * as THREE from 'three';
import { box, merge, shade, tinted } from './geom';
import { surfaceMaterial } from './materials/surface';
import { prng } from './noise';

const QUAY_SURFACES: ReadonlySet<Surface> = new Set([Surface.Stone, Surface.Concrete, Surface.Gravel]);

/**
 * Stone retaining walls with coping wherever paved ground drops into water, built from the
 * level's cell data so any coastal layout gets them.
 */
function buildQuayWalls(level: LevelData): { walls: THREE.BufferGeometry | null; coping: THREE.BufferGeometry | null } {
  const grid = new Grid(level);
  const cs = level.cellSize;
  const walls: THREE.BufferGeometry[] = [];
  const coping: THREE.BufferGeometry[] = [];
  const random = prng(level.seed ^ 0xa11);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (let row = 0; row < level.rows; row += 1) {
    for (let col = 0; col < level.cols; col += 1) {
      const cell = row * level.cols + col;
      if (!QUAY_SURFACES.has(level.surface[cell] as Surface)) continue;
      const top = level.cellHeight[cell]!;
      for (const [dc, dr] of dirs) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= level.cols || nr >= level.rows) continue;
        const n = nr * level.cols + nc;
        const wet = (level.flags[n]! & (CellFlag.Deep | CellFlag.Shallow)) !== 0;
        if (!wet || top - level.cellHeight[n]! < 1.2) continue;
        const c = grid.center(cell);
        const ex = c.x + (dc * cs) / 2;
        const ez = c.z + (dr * cs) / 2;
        const bottom = Math.min(level.cellHeight[n]!, level.seaLevel) - 0.6;
        const height = top - bottom;
        const alongX = dc === 0;
        const len = cs + 0.02;
        const thick = 0.7;
        walls.push(
          tinted(box(alongX ? len : thick, height, alongX ? thick : len, ex - (dc * thick) / 2, bottom + height / 2, ez - (dr * thick) / 2), shade(0.95, 0.12, random)),
        );
        const capT = 0.85;
        coping.push(
          tinted(box(alongX ? len : capT, 0.24, alongX ? capT : len, ex - dc * (capT / 2 - 0.12), top + 0.06, ez - dr * (capT / 2 - 0.12)), shade(0.9, 0.16, random)),
        );
      }
    }
  }
  return { walls: merge(walls), coping: merge(coping) };
}

interface PierParts {
  deck: THREE.BufferGeometry | null;
  frame: THREE.BufferGeometry | null;
  ladders: THREE.BufferGeometry | null;
}

/** Plank-by-plank wooden piers on posts with bracing, plus iron ladders at the swim routes. */
function buildPiers(level: LevelData): PierParts {
  const grid = new Grid(level);
  const random = prng(level.seed ^ 0xb0a7);
  const deck: THREE.BufferGeometry[] = [];
  const frame: THREE.BufferGeometry[] = [];
  const ladders: THREE.BufferGeometry[] = [];
  for (const s of level.structures) {
    if (s.kind !== 'pier') continue;
    const alongZ = s.size.z >= s.size.x;
    const length = alongZ ? s.size.z : s.size.x;
    const width = alongZ ? s.size.x : s.size.z;
    const topY = s.height;
    const at = (u: number, v: number) => (alongZ ? { x: s.pos.x + v, z: s.pos.z + u } : { x: s.pos.x + u, z: s.pos.z + v });
    // Deck planks across the width, with small gaps and uneven wear.
    for (let u = -length / 2 + 0.15; u < length / 2; u += 0.3) {
      const p = at(u, 0);
      const plank = box(alongZ ? width + 0.1 : 0.26, 0.07, alongZ ? 0.26 : width + 0.1, p.x, topY - 0.035 + (random() - 0.5) * 0.02, p.z);
      plank.rotateY(0);
      deck.push(tinted(plank, shade(0.92, 0.3, random)));
    }
    // Stringers under the deck and posts down to the sea bed.
    for (const v of [-width / 2 + 0.2, width / 2 - 0.2]) {
      const mid = at(0, v);
      frame.push(tinted(box(alongZ ? 0.2 : length, 0.22, alongZ ? length : 0.2, mid.x, topY - 0.19, mid.z), shade(0.65, 0.1, random)));
      for (let u = -length / 2 + 0.3; u <= length / 2 - 0.2; u += 2) {
        const p = at(u, v);
        const bed = Math.min(grid.heightAt(p), level.seaLevel - 1);
        const raised = Math.abs(u - (-length / 2 + 0.3)) < 0.01 || Math.abs(u - length / 2) < 2.2 ? 0.7 : 0.05;
        const h = topY + raised - bed;
        frame.push(tinted(box(0.24, h, 0.24, p.x, bed + h / 2, p.z), shade(0.6, 0.15, random)));
      }
    }
    // Cross bracing between opposite posts, just below the deck.
    for (let u = -length / 2 + 0.3; u <= length / 2 - 0.2; u += 2) {
      const p = at(u, 0);
      const brace = new THREE.BoxGeometry(alongZ ? width - 0.2 : 0.12, 0.12, alongZ ? 0.12 : width - 0.2);
      brace.rotateZ(alongZ ? 0.45 : 0);
      brace.rotateX(alongZ ? 0 : 0.45);
      brace.translate(p.x, topY - 0.9, p.z);
      frame.push(tinted(brace, shade(0.6, 0.1, random)));
    }
  }
  // Iron ladders where a swimmer climbs out (ladder links).
  for (const link of level.links) {
    if (link.kind !== 'ladder') continue;
    const a = grid.center(link.a);
    const b = grid.center(link.b);
    const high = level.cellHeight[link.a]! > level.cellHeight[link.b]! ? a : b;
    const low = high === a ? b : a;
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    const top = level.cellHeight[high === a ? link.a : link.b]! + 0.6;
    const bottom = level.seaLevel - 0.8;
    const along = Math.abs(high.x - low.x) > Math.abs(high.z - low.z);
    for (const side of [-0.22, 0.22]) {
      ladders.push(box(0.05, top - bottom, 0.05, x + (along ? 0 : side), (top + bottom) / 2, z + (along ? side : 0)));
    }
    for (let y = bottom + 0.3; y < top - 0.2; y += 0.32) ladders.push(box(along ? 0.04 : 0.44, 0.04, along ? 0.44 : 0.04, x, y, z));
  }
  return { deck: merge(deck), frame: merge(frame), ladders: merge(ladders) };
}

export function Harbor({ level }: { level: LevelData }) {
  const quay = useMemo(() => buildQuayWalls(level), [level]);
  const piers = useMemo(() => buildPiers(level), [level]);
  const stone = useMemo(() => surfaceMaterial('stone-wall', { scale: 2.6, vertexColors: true, macro: 0.4, moss: 0.25, roughness: 0.8 }), []);
  const coping = useMemo(() => surfaceMaterial('concrete', { scale: 2, vertexColors: true, tint: '#b8b4aa', roughness: 0.7 }), []);
  const planks = useMemo(() => surfaceMaterial('planks', { scale: 2.2, vertexColors: true, roughness: 0.7 }), []);
  const iron = useMemo(() => surfaceMaterial('metal', { scale: 1, tint: '#3c3f42', metalness: 0.6, roughness: 0.6 }), []);
  return (
    <group name="harbor">
      {quay.walls && <mesh geometry={quay.walls} material={stone} castShadow receiveShadow />}
      {quay.coping && <mesh geometry={quay.coping} material={coping} castShadow receiveShadow />}
      {piers.deck && <mesh geometry={piers.deck} material={planks} castShadow receiveShadow />}
      {piers.frame && <mesh geometry={piers.frame} material={planks} castShadow receiveShadow />}
      {piers.ladders && <mesh geometry={piers.ladders} material={iron} castShadow />}
    </group>
  );
}
