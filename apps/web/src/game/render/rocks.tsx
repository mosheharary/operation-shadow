'use client';

import { CellFlag, Grid, type LevelData, Surface } from '@operation-shadow/engine';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { surfaceMaterial } from './materials/surface';
import { hash2, prng, valueNoise3 } from './noise';

const VARIANTS = 6;
const MAX_ROCKS = 1100;

/** A faceted boulder: a displaced icosphere with flat-shaded faces and a flattened base. */
function rockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const stretch = [
    [1.35, 0.8, 1.0],
    [1.0, 0.65, 1.2],
    [0.9, 1.25, 0.85],
    [1.5, 0.55, 1.1],
    [1.1, 0.9, 1.1],
    [1.25, 1.05, 0.8],
  ][seed % VARIANTS]!;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const n = valueNoise3(v.x * 1.4 + seed * 3.1, v.y * 1.4, v.z * 1.4, seed) - 0.5;
    const fine = valueNoise3(v.x * 3.4, v.y * 3.4 + seed, v.z * 3.4, seed + 9) - 0.5;
    const r = 1 + n * 0.55 + fine * 0.16;
    v.multiplyScalar(r);
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.35;
    pos.setXYZ(i, v.x * stretch[0]!, v.y * stretch[1]!, v.z * stretch[2]!);
  }
  // Non-indexed faces with computed normals give the chiselled, faceted look of the concept art.
  const faceted = g.index ? g.toNonIndexed() : g;
  faceted.computeVertexNormals();
  return faceted;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotY: number;
  tilt: number;
}

function placements(level: LevelData): Placement[][] {
  const grid = new Grid(level);
  const random = prng(level.seed ^ 0x51ed);
  const out: Placement[][] = Array.from({ length: VARIANTS }, () => []);
  const climbs = level.links.filter((l) => l.kind === 'climb').map((l) => [grid.center(l.a), grid.center(l.b)] as const);
  const nearClimb = (x: number, z: number) =>
    climbs.some(([a, b]) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < 2.2;
    });
  let count = 0;
  const add = (p: Placement) => {
    if (count >= MAX_ROCKS) return;
    out[Math.floor(random() * VARIANTS)]!.push(p);
    count += 1;
  };

  // Cliff faces: chunky outcrops on steep natural ground, denser where the slope is steeper.
  for (let cell = 0; cell < level.cols * level.rows; cell += 2) {
    if (!(level.flags[cell]! & CellFlag.Steep)) continue;
    const surface = level.surface[cell] as Surface;
    if (surface === Surface.Stone || surface === Surface.Wood || surface === Surface.Concrete) continue;
    const c = grid.center(cell);
    if (hash2(Math.floor(c.x * 2), Math.floor(c.z * 2), 77) > 0.2 || nearClimb(c.x, c.z)) continue;
    const x = c.x + (random() - 0.5) * 0.8;
    const z = c.z + (random() - 0.5) * 0.8;
    const scale = 0.7 + random() * 1.5;
    add({ x, y: grid.heightAt({ x, z }) - scale * 0.25, z, scale, rotY: random() * Math.PI * 2, tilt: (random() - 0.5) * 0.6 });
  }
  // Cliff bases: boulders where deep water meets steep ground.
  for (let cell = 0; cell < level.cols * level.rows; cell += 3) {
    if (!(level.flags[cell]! & CellFlag.Deep)) continue;
    const c = grid.center(cell);
    const cliff = [
      [1.5, 0],
      [-1.5, 0],
      [0, 1.5],
      [0, -1.5],
    ].some(([dx, dz]) => {
      const n = grid.cellAt({ x: c.x + dx!, z: c.z + dz! });
      // Natural cliffs only: quay walls and piers get no boulders.
      const surface = n >= 0 ? (level.surface[n] as Surface) : Surface.Grass;
      const built = surface === Surface.Stone || surface === Surface.Concrete || surface === Surface.Wood || surface === Surface.Gravel;
      return n >= 0 && !built && (level.flags[n]! & CellFlag.Steep) !== 0 && level.cellHeight[n]! > level.seaLevel + 2;
    });
    if (!cliff || random() > 0.35) continue;
    const scale = 1 + random() * 1.6;
    add({ x: c.x, y: level.seaLevel - scale * 0.45, z: c.z, scale, rotY: random() * Math.PI * 2, tilt: (random() - 0.5) * 0.5 });
  }
  // Rock props placed by the generator (groyne, plateau): solid in the simulation too.
  for (const p of level.props) {
    if (p.kind !== 'rock') continue;
    const scale = p.scale * 0.85;
    add({ x: p.pos.x, y: grid.heightAt(p.pos) - scale * 0.2, z: p.pos.z, scale, rotY: p.rotation, tilt: 0 });
  }
  return out;
}

/** Faceted, mossy rocks on cliffs and shorelines (decorative except the generator's rock props). */
export function Rocks({ level }: { level: LevelData }) {
  const geometries = useMemo(() => Array.from({ length: VARIANTS }, (_, i) => rockGeometry(i)), []);
  const groups = useMemo(() => placements(level), [level]);
  const material = useMemo(() => surfaceMaterial('rock', { scale: 2.4, moss: 0.7, macro: 0.55, tint: '#d4d6cf', roughness: 0.85 }), []);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    groups.forEach((list, v) => {
      const mesh = refs.current[v];
      if (!mesh) return;
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.tilt, p.rotY, p.tilt * 0.5);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [groups]);

  return (
    <group name="rocks">
      {geometries.map((geometry, v) => (
        <instancedMesh
          key={v}
          ref={(m) => {
            refs.current[v] = m;
          }}
          args={[geometry, material, Math.max(1, groups[v]!.length)]}
          count={groups[v]!.length}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
