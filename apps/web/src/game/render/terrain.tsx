'use client';

import { CellFlag, type LevelData, type Surface } from '@operation-shadow/engine';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { jitter, ROCK_COLOR, SURFACE_COLORS } from './palette';

function buildTerrainGeometry(level: LevelData): THREE.BufferGeometry {
  const step = level.heightfieldStep;
  const vx = Math.floor(level.width / step) + 1;
  const vz = Math.floor(level.depth / step) + 1;
  const positions = new Float32Array(vx * vz * 3);
  const colors = new Float32Array(vx * vz * 3);
  const light = new Float32Array(vx * vz);
  const color = new THREE.Color();
  const rock = new THREE.Color(ROCK_COLOR);
  const cs = level.cellSize;

  for (let z = 0; z < vz; z += 1) {
    for (let x = 0; x < vx; x += 1) {
      const i = z * vx + x;
      const wx = x * step;
      const wz = z * step;
      positions[i * 3] = wx;
      positions[i * 3 + 1] = level.heightfield[i]!;
      positions[i * 3 + 2] = wz;
      const col = Math.min(level.cols - 1, Math.floor(wx / cs));
      const row = Math.min(level.rows - 1, Math.floor(wz / cs));
      const cell = row * level.cols + col;
      const surface = level.surface[cell] as Surface;
      color.set(SURFACE_COLORS[surface]);
      if ((level.flags[cell]! & CellFlag.Steep) !== 0) color.copy(rock);
      const shade = 1 + jitter(wx, wz) * 0.07;
      colors[i * 3] = color.r * shade;
      colors[i * 3 + 1] = color.g * shade;
      colors[i * 3 + 2] = color.b * shade;
      light[i] = level.staticLight[cell]! / 255;
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
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aLight', new THREE.BufferAttribute(light, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Vertical sides around the map so the terrain reads as a cut diorama block, not a paper sheet. */
function buildSkirtGeometry(level: LevelData): THREE.BufferGeometry {
  const step = level.heightfieldStep;
  const vx = Math.floor(level.width / step) + 1;
  const vz = Math.floor(level.depth / step) + 1;
  const bottom = level.seaLevel - 4;
  const ring: { x: number; z: number; i: number }[] = [];
  for (let x = 0; x < vx; x += 1) ring.push({ x: x * step, z: 0, i: x });
  for (let z = 1; z < vz; z += 1) ring.push({ x: (vx - 1) * step, z: z * step, i: z * vx + vx - 1 });
  for (let x = vx - 2; x >= 0; x -= 1) ring.push({ x: x * step, z: (vz - 1) * step, i: (vz - 1) * vx + x });
  for (let z = vz - 2; z >= 0; z -= 1) ring.push({ x: 0, z: z * step, i: z * vx });
  const positions: number[] = [];
  for (let k = 0; k < ring.length - 1; k += 1) {
    const a = ring[k]!;
    const b = ring[k + 1]!;
    const ha = level.heightfield[a.i]!;
    const hb = level.heightfield[b.i]!;
    positions.push(a.x, ha, a.z, a.x, bottom, a.z, b.x, hb, b.z, b.x, hb, b.z, a.x, bottom, a.z, b.x, bottom, b.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Terrain material that adds baked lamp/window light (the same light map the AI uses) as emissive. */
function createTerrainMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLight;\nvarying float vLight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLight = aLight;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLight;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.78, 0.5) * vLight * 1.6;',
      );
  };
  return material;
}

export interface TerrainProps {
  level: LevelData;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: () => void;
}

export function Terrain({ level, onPointerMove, onPointerDown, onPointerLeave }: TerrainProps) {
  const geometry = useMemo(() => buildTerrainGeometry(level), [level]);
  const skirt = useMemo(() => buildSkirtGeometry(level), [level]);
  const terrainMaterial = useMemo(() => createTerrainMaterial(), []);
  return (
    <>
      <mesh
        name="terrain"
        geometry={geometry}
        material={terrainMaterial}
        receiveShadow
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerLeave}
      />
      <mesh name="terrain-skirt" geometry={skirt}>
        <meshStandardMaterial color="#2c261e" roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}
