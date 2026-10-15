'use client';

import { CellFlag, Grid, type LevelData, type PropDef, type PropKind } from '@operation-shadow/engine';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { jitter, material } from './palette';

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  shadow?: boolean;
}

function geo<T extends THREE.BufferGeometry>(g: T, transform: (g: T) => void): T {
  transform(g);
  return g;
}

const lampGlow = () => material('#ffd8a0', { emissive: '#ffc070', emissiveIntensity: 2.4 });

/** Primitive-built models, each facing +x (rotation is applied per instance from the prop heading). */
function partsFor(kind: PropKind): Part[] {
  switch (kind) {
    case 'crate':
      return [{ geometry: geo(new THREE.BoxGeometry(1, 1, 1), (g) => g.translate(0, 0.5, 0)), material: material('#7b5f3d'), shadow: true }];
    case 'barrel':
      return [{ geometry: geo(new THREE.CylinderGeometry(0.34, 0.34, 1, 10), (g) => g.translate(0, 0.5, 0)), material: material('#5c4f3f'), shadow: true }];
    case 'fuel-barrel':
      return [{ geometry: geo(new THREE.CylinderGeometry(0.34, 0.34, 1, 10), (g) => g.translate(0, 0.5, 0)), material: material('#7a2e24', { roughness: 0.6 }), shadow: true }];
    case 'net':
      return [{ geometry: geo(new THREE.SphereGeometry(0.75, 10, 6), (g) => g.scale(1.2, 0.28, 0.9)), material: material('#4f4636') }];
    case 'rowboat':
      return [
        { geometry: geo(new THREE.CapsuleGeometry(0.62, 2.2, 4, 10), (g) => { g.rotateZ(Math.PI / 2); g.scale(1, 0.5, 1); g.translate(0, 0.2, 0); }), material: material('#5b4a36'), shadow: true },
        { geometry: geo(new THREE.BoxGeometry(0.2, 0.06, 1.1), (g) => g.translate(0, 0.42, 0)), material: material('#7a6248') },
      ];
    case 'fishing-boat':
      return [
        { geometry: geo(new THREE.CapsuleGeometry(1.4, 5.4, 4, 12), (g) => { g.rotateZ(Math.PI / 2); g.scale(1, 0.62, 1); g.translate(0, 0.5, 0); }), material: material('#3c4850'), shadow: true },
        { geometry: geo(new THREE.BoxGeometry(1.8, 1.4, 1.7), (g) => g.translate(-0.8, 1.9, 0)), material: material('#c8bea9'), shadow: true },
        { geometry: geo(new THREE.CylinderGeometry(0.07, 0.08, 5.2, 6), (g) => g.translate(1.2, 3.6, 0)), material: material('#4b3c2b') },
      ];
    case 'lamp-post':
      return [
        { geometry: geo(new THREE.CylinderGeometry(0.06, 0.08, 4, 6), (g) => g.translate(0, 2, 0)), material: material('#2f3234', { metalness: 0.4 }), shadow: true },
        { geometry: geo(new THREE.BoxGeometry(0.36, 0.3, 0.36), (g) => g.translate(0, 4.05, 0)), material: lampGlow() },
      ];
    case 'tree-pine':
      return [
        { geometry: geo(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6), (g) => g.translate(0, 1.2, 0)), material: material('#4a3a2a'), shadow: true },
        { geometry: geo(new THREE.ConeGeometry(2.0, 3.3, 8), (g) => g.translate(0, 3.3, 0)), material: material('#2e4130'), shadow: true },
        { geometry: geo(new THREE.ConeGeometry(1.55, 2.8, 8), (g) => g.translate(0, 5.0, 0)), material: material('#334a37'), shadow: true },
        { geometry: geo(new THREE.ConeGeometry(1.0, 2.3, 8), (g) => g.translate(0, 6.6, 0)), material: material('#38503c'), shadow: true },
      ];
    case 'tree-oak':
      return [
        { geometry: geo(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 6), (g) => g.translate(0, 1.3, 0)), material: material('#4a3a2a'), shadow: true },
        { geometry: geo(new THREE.IcosahedronGeometry(2.1, 1), (g) => g.translate(0, 3.8, 0)), material: material('#3a4a2c'), shadow: true },
      ];
    case 'bush':
      return [{ geometry: geo(new THREE.IcosahedronGeometry(0.85, 1), (g) => { g.scale(1.2, 0.8, 1); g.translate(0, 0.55, 0); }), material: material('#3a4a2b'), shadow: true }];
    case 'rock':
      return [{ geometry: geo(new THREE.DodecahedronGeometry(0.8, 0), (g) => { g.scale(1.2, 0.75, 1); g.translate(0, 0.3, 0); }), material: material('#67645c'), shadow: true }];
    case 'tall-grass':
      return [{ geometry: geo(new THREE.ConeGeometry(0.6, 0.9, 7, 1, true), (g) => g.translate(0, 0.45, 0)), material: material('#56663a', { roughness: 1 }) }];
    case 'antenna':
      return [
        { geometry: geo(new THREE.CylinderGeometry(0.05, 0.09, 9, 5), (g) => g.translate(0, 4.5, 0)), material: material('#4d5154', { metalness: 0.5 }) },
        { geometry: geo(new THREE.BoxGeometry(1.6, 0.05, 0.05), (g) => g.translate(0, 7.5, 0)), material: material('#4d5154') },
        { geometry: geo(new THREE.SphereGeometry(0.12, 6, 4), (g) => g.translate(0, 9.05, 0)), material: material('#ff5040', { emissive: '#ff3020', emissiveIntensity: 2 }) },
      ];
    case 'gun':
      return [
        { geometry: geo(new THREE.BoxGeometry(1.5, 0.8, 1.5), (g) => g.translate(0, 0.4, 0)), material: material('#4a4f53'), shadow: true },
        { geometry: geo(new THREE.CylinderGeometry(0.13, 0.17, 4.4, 8), (g) => { g.rotateZ(Math.PI / 2); g.translate(2.0, 1.25, 0); }), material: material('#3b4044', { metalness: 0.5 }), shadow: true },
        { geometry: geo(new THREE.BoxGeometry(0.2, 1.1, 1.8), (g) => g.translate(0.6, 1.2, 0)), material: material('#4f5458'), shadow: true },
      ];
    case 'truck':
      return [
        { geometry: geo(new THREE.BoxGeometry(3.0, 1.7, 2.2), (g) => g.translate(-0.6, 1.55, 0)), material: material('#5c604a'), shadow: true },
        { geometry: geo(new THREE.BoxGeometry(1.5, 1.5, 2.1), (g) => g.translate(1.75, 1.25, 0)), material: material('#4c5240'), shadow: true },
        ...[-1.4, 1.6].flatMap((x) =>
          [-1.05, 1.05].map((z) => ({ geometry: geo(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), (g) => { g.rotateX(Math.PI / 2); g.translate(x, 0.42, z); }), material: material('#222426') })),
        ),
      ];
    case 'buoy':
      return [
        { geometry: geo(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 8), (g) => g.translate(0, 0.4, 0)), material: material('#a34b2f') },
        { geometry: geo(new THREE.SphereGeometry(0.12, 6, 4), (g) => g.translate(0, 1.1, 0)), material: material('#ffeec0', { emissive: '#ffe080', emissiveIntensity: 3 }) },
      ];
    case 'sandbag':
    case 'bench':
    case 'bollard':
    case 'searchlight':
      return [{ geometry: geo(new THREE.BoxGeometry(0.8, 0.6, 0.5), (g) => g.translate(0, 0.3, 0)), material: material('#6b6250') }];
  }
}

const FLOATING: ReadonlySet<PropKind> = new Set(['rowboat', 'fishing-boat', 'buoy']);

function PropKindInstances({ kind, props, grid, seaLevel }: { kind: PropKind; props: PropDef[]; grid: Grid; seaLevel: number }) {
  const parts = useMemo(() => partsFor(kind), [kind]);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    props.forEach((p, i) => {
      const cell = grid.cellAt(p.pos);
      const wet = cell >= 0 && (grid.hasFlag(cell, CellFlag.Deep) || grid.hasFlag(cell, CellFlag.Shallow));
      const y = FLOATING.has(kind) && wet ? seaLevel - 0.15 : grid.heightAt(p.pos);
      dummy.position.set(p.pos.x, y, p.pos.z);
      dummy.rotation.set(0, -p.rotation, 0);
      const wobble = kind.startsWith('tree') ? 1 + jitter(p.pos.x, p.pos.z, 7) * 0.08 : 1;
      dummy.scale.set(p.scale, p.scale * wobble, p.scale);
      dummy.updateMatrix();
      for (const mesh of refs.current) mesh?.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of refs.current) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [props, grid, kind, seaLevel]);

  return (
    <>
      {parts.map((part, i) => (
        <instancedMesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          args={[part.geometry, part.material, props.length]}
          castShadow={part.shadow ?? false}
          receiveShadow
        />
      ))}
    </>
  );
}

/** All level props, instanced per kind and part (one draw call per part type). */
export function Props({ level }: { level: LevelData }) {
  const grid = useMemo(() => new Grid(level), [level]);
  const byKind = useMemo(() => {
    const map = new Map<PropKind, PropDef[]>();
    for (const p of level.props) {
      const list = map.get(p.kind) ?? [];
      list.push(p);
      map.set(p.kind, list);
    }
    return [...map.entries()];
  }, [level]);
  return (
    <group name="props">
      {byKind.map(([kind, props]) => (
        <PropKindInstances key={kind} kind={kind} props={props} grid={grid} seaLevel={level.seaLevel} />
      ))}
    </group>
  );
}
