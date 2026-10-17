'use client';

import { CellFlag, Grid, type LevelData, Surface } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cameraFocus } from '../camera/camera-rig';
import { windMaterial } from './materials/wind';
import { hash2, prng } from './noise';

/** Chunk edge (metres): grass is shown and hidden a chunk at a time around the camera. */
const CHUNK = 16;
/** Only chunks this close to the camera's focus are drawn. */
const RADIUS = 62;
/** Tufts per grass cell (on average). */
const DENSITY = 0.3;

/** A tuft of tapered blades, base at the origin (12 blades, two triangles each). */
function tuftGeometry(): THREE.BufferGeometry {
  const random = prng(4242);
  const positions: number[] = [];
  const shades: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const h = 0.22 + random() * 0.32;
    const w = 0.018 + random() * 0.014;
    const a = random() * Math.PI;
    const ox = (random() - 0.5) * 0.45;
    const oz = (random() - 0.5) * 0.45;
    const lean = (random() - 0.5) * 0.18;
    const cx = Math.cos(a) * w;
    const cz = Math.sin(a) * w;
    const tipX = ox + Math.cos(a + Math.PI / 2) * lean;
    const tipZ = oz + Math.sin(a + Math.PI / 2) * lean;
    // Two triangles: a wide base quad narrowing to the tip.
    positions.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, tipX + cx * 0.3, h * 0.6, tipZ + cz * 0.3);
    positions.push(ox - cx, 0, oz - cz, tipX + cx * 0.3, h * 0.6, tipZ + cz * 0.3, tipX, h, tipZ);
    for (const y of [0, 0, 0.6, 0, 0.6, 1]) {
      const v = 0.45 + y * 0.55;
      shades.push(v, v, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
  g.computeVertexNormals();
  // Blades face up for lighting, so a field reads as a soft surface rather than as cards.
  const normal = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normal.count; i += 1) normal.setXYZ(i, normal.getX(i) * 0.3, 1, normal.getZ(i) * 0.3);
  normal.needsUpdate = true;
  return g;
}

interface Chunk {
  centre: THREE.Vector2;
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
}

function chunksFor(level: LevelData): Chunk[] {
  const grid = new Grid(level);
  const random = prng(level.seed ^ 0x6a55);
  const byKey = new Map<string, Chunk>();
  const dummy = new THREE.Object3D();
  const dry = new THREE.Color('#8a8a52');
  const lush = new THREE.Color('#4f6a33');
  for (let cell = 0; cell < level.cols * level.rows; cell += 1) {
    if (level.surface[cell] !== Surface.Grass) continue;
    const flags = level.flags[cell]!;
    if (!(flags & CellFlag.Walkable) || flags & (CellFlag.Indoor | CellFlag.Shallow | CellFlag.Deep)) continue;
    if (random() > DENSITY) continue;
    const c = grid.center(cell);
    const x = c.x + (random() - 0.5) * level.cellSize;
    const z = c.z + (random() - 0.5) * level.cellSize;
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let chunk = byKey.get(key);
    if (!chunk) {
      chunk = { centre: new THREE.Vector2((Math.floor(x / CHUNK) + 0.5) * CHUNK, (Math.floor(z / CHUNK) + 0.5) * CHUNK), matrices: [], colors: [] };
      byKey.set(key, chunk);
    }
    dummy.position.set(x, grid.heightAt({ x, z }) - 0.02, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    const s = 0.7 + random() * 0.7;
    dummy.scale.set(s, s * (0.8 + random() * 0.5), s);
    dummy.updateMatrix();
    chunk.matrices.push(dummy.matrix.clone());
    chunk.colors.push(lush.clone().lerp(dry, hash2(Math.round(x * 0.3), Math.round(z * 0.3), 5) * 0.8 + random() * 0.2));
  }
  return [...byKey.values()];
}

/** Wind-swayed grass tufts over the grass ground near the camera (rich environment setting). */
export function Grass({ level }: { level: LevelData }) {
  const group = useRef<THREE.Group>(null);
  const { meshes, geometry, material } = useMemo(() => {
    const geo = tuftGeometry();
    const base = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    const { material: mat } = windMaterial(base, 0.35);
    const built = chunksFor(level).map((chunk) => {
      const mesh = new THREE.InstancedMesh(geo, mat, chunk.matrices.length);
      chunk.matrices.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, chunk.colors[i]!);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.userData.centre = chunk.centre;
      return mesh;
    });
    return { meshes: built, geometry: geo, material: mat };
  }, [level]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      for (const mesh of meshes) mesh.dispose();
    },
    [meshes, geometry, material],
  );

  useFrame((frame) => {
    const focus = cameraFocus(frame.camera);
    for (const mesh of meshes) {
      const centre = mesh.userData.centre as THREE.Vector2;
      mesh.visible = Math.hypot(centre.x - focus.x, centre.y - focus.z) < RADIUS;
    }
  });

  return (
    <group ref={group} name="grass">
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
}
