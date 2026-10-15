'use client';

import { CellFlag, Grid, type LevelData, Surface } from '@operation-shadow/engine';
import { useMemo } from 'react';
import * as THREE from 'three';
import { surfaceMaterial } from './materials/surface';
import { createTerrainMaterial, ROCK_LAYER } from './materials/terrain-material';
import { fbm2 } from './noise';

/** Render mesh resolution (the gameplay heightfield is 1 m; the extra vertices carry cliff detail). */
const STEP = 0.5;

/** Engine surface → terrain texture layer (see TERRAIN_LAYERS). */
const SURFACE_LAYER: Record<Surface, number> = {
  [Surface.Grass]: 0,
  [Surface.Sand]: 1,
  [Surface.ShallowWater]: 1,
  [Surface.DeepWater]: 1,
  [Surface.Snow]: 1,
  [Surface.Stone]: 2,
  [Surface.Gravel]: 3,
  [Surface.Dirt]: 4,
  [Surface.Mud]: 4,
  [Surface.Rock]: ROCK_LAYER,
  [Surface.Concrete]: 6,
  [Surface.Metal]: 6,
  [Surface.Wood]: 7,
};

const BUILT: ReadonlySet<Surface> = new Set([Surface.Stone, Surface.Concrete, Surface.Wood, Surface.Metal]);

function buildTerrainGeometry(level: LevelData): THREE.BufferGeometry {
  const grid = new Grid(level);
  const vx = Math.round(level.width / STEP) + 1;
  const vz = Math.round(level.depth / STEP) + 1;
  const positions = new Float32Array(vx * vz * 3);
  const splatA = new Float32Array(vx * vz * 4);
  const splatB = new Float32Array(vx * vz * 4);
  const light = new Float32Array(vx * vz);
  const weights = new Float32Array(8);
  const H = (x: number, z: number) => grid.heightAt({ x, z });

  for (let iz = 0; iz < vz; iz += 1) {
    for (let ix = 0; ix < vx; ix += 1) {
      const i = iz * vx + ix;
      const x = ix * STEP;
      const z = iz * STEP;
      let y = H(x, z);
      weights.fill(0);
      let built = false;
      let lit = 0;
      let samples = 0;
      for (const [dx, dz] of [
        [-0.25, -0.25],
        [0.25, -0.25],
        [-0.25, 0.25],
        [0.25, 0.25],
      ] as const) {
        const cell = grid.cellAt({ x: x + dx, z: z + dz });
        if (cell < 0) continue;
        const surface = level.surface[cell] as Surface;
        weights[SURFACE_LAYER[surface] ?? 0]! += 1;
        if (level.flags[cell]! & CellFlag.Steep) weights[ROCK_LAYER]! += 0.6;
        if (BUILT.has(surface)) built = true;
        lit += level.staticLight[cell]!;
        samples += 1;
      }
      const sum = weights.reduce((a, b) => a + b, 0) || 1;
      for (let k = 0; k < 4; k += 1) {
        splatA[i * 4 + k] = weights[k]! / sum;
        splatB[i * 4 + k] = weights[k + 4]! / sum;
      }
      light[i] = samples ? lit / samples / 255 : 0;

      // Crags: push steep, natural ground in and out along the slope (render only).
      let px = x;
      let pz = z;
      const gx = H(x + 0.5, z) - H(x - 0.5, z);
      const gz = H(x, z + 0.5) - H(x, z - 0.5);
      const slope = Math.hypot(gx, gz);
      if (slope > 0.9 && !built && ix > 0 && iz > 0 && ix < vx - 1 && iz < vz - 1) {
        const nearBuilt = [-1, 1].some((d) => {
          const a = grid.cellAt({ x: x + d, z });
          const b = grid.cellAt({ x, z: z + d });
          return (a >= 0 && BUILT.has(level.surface[a] as Surface)) || (b >= 0 && BUILT.has(level.surface[b] as Surface));
        });
        if (!nearBuilt) {
          const amp = Math.min(1, (slope - 0.9) / 1.4) * 0.8;
          const n1 = fbm2(x * 0.42, z * 0.42 + y * 0.35, 11) - 0.5;
          const n2 = fbm2(x * 0.95 + 5.3, z * 0.95 - y * 0.2, 23) - 0.5;
          px += (gx / slope) * n1 * amp * 1.8;
          pz += (gz / slope) * n1 * amp * 1.8;
          y += n2 * amp * 1.2;
        }
      }
      positions[i * 3] = px;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = pz;
    }
  }

  const indices = new Uint32Array((vx - 1) * (vz - 1) * 6);
  let k = 0;
  for (let z = 0; z < vz - 1; z += 1) {
    for (let x = 0; x < vx - 1; x += 1) {
      const a = z * vx + x;
      const b = a + 1;
      const c = a + vx;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('splatA', new THREE.BufferAttribute(splatA, 4));
  geometry.setAttribute('splatB', new THREE.BufferAttribute(splatB, 4));
  geometry.setAttribute('aLight', new THREE.BufferAttribute(light, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Vertical sides around the map so the level reads as a cut diorama block. */
function buildSkirtGeometry(level: LevelData): THREE.BufferGeometry {
  const grid = new Grid(level);
  const bottom = level.seaLevel - 4.5;
  const ring: { x: number; z: number }[] = [];
  const W = level.width;
  const D = level.depth;
  for (let x = 0; x <= W; x += STEP) ring.push({ x, z: 0 });
  for (let z = STEP; z <= D; z += STEP) ring.push({ x: W, z });
  for (let x = W - STEP; x >= 0; x -= STEP) ring.push({ x, z: D });
  for (let z = D - STEP; z >= 0; z -= STEP) ring.push({ x: 0, z });
  const positions: number[] = [];
  for (let k = 0; k < ring.length - 1; k += 1) {
    const a = ring[k]!;
    const b = ring[k + 1]!;
    const ha = grid.heightAt(a);
    const hb = grid.heightAt(b);
    positions.push(a.x, ha, a.z, a.x, bottom, a.z, b.x, hb, b.z, b.x, hb, b.z, a.x, bottom, a.z, b.x, bottom, b.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export interface TerrainProps {
  level: LevelData;
  /** 0..1 surface wetness (rain). */
  wetness?: number;
}

export function Terrain({ level, wetness = 0.2 }: TerrainProps) {
  const geometry = useMemo(() => buildTerrainGeometry(level), [level]);
  const skirt = useMemo(() => buildSkirtGeometry(level), [level]);
  const terrainMaterial = useMemo(() => createTerrainMaterial({ seaLevel: level.seaLevel, wetness }), [level.seaLevel, wetness]);
  const skirtMaterial = useMemo(() => surfaceMaterial('rock', { scale: 3.5, tint: '#6b5f52', macro: 0.6, side: THREE.DoubleSide }), []);
  return (
    <>
      <mesh name="terrain" geometry={geometry} material={terrainMaterial} receiveShadow castShadow />
      <mesh name="terrain-skirt" geometry={skirt} material={skirtMaterial} />
    </>
  );
}
