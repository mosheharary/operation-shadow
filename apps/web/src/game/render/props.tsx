'use client';

import { CellFlag, Grid, type LevelData, type PropDef, type PropKind, Surface } from '@operation-shadow/engine';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { box, merge, tinted } from './geom';
import { surfaceMaterial } from './materials/surface';
import { hash2, prng, valueNoise3 } from './noise';
import { material } from './palette';

/** One instanced part of a prop model: geometry (feet at the origin, facing +x) and material. */
interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  shadow?: boolean;
}

const t = <T extends THREE.BufferGeometry>(g: T, f: (g: T) => void): T => {
  f(g);
  return g;
};

// ── Shared materials ──────────────────────────────────────────────────────────────────────────
const M = {
  crate: () => surfaceMaterial('planks-light', { scale: 0.9, tint: '#c9b28c', roughness: 0.9, vertexColors: true }),
  barrel: () => surfaceMaterial('planks-light', { scale: 0.8, tint: '#9c7650', roughness: 0.7 }),
  iron: () => surfaceMaterial('metal', { scale: 0.8, tint: '#3a3d40', metalness: 0.55, roughness: 0.55 }),
  drum: () => surfaceMaterial('metal', { scale: 0.9, tint: '#7b3427', metalness: 0.35, roughness: 0.55 }),
  hull: () => surfaceMaterial('planks', { scale: 1.2, roughness: 0.65, side: THREE.DoubleSide }),
  olive: () => surfaceMaterial('metal', { scale: 1.4, tint: '#5f6a43', metalness: 0.3, roughness: 0.6 }),
  canvas: () => surfaceMaterial('plaster', { scale: 1.2, tint: '#7e7f5c', roughness: 1 }),
  net: () => surfaceMaterial('planks-light', { scale: 0.35, tint: '#7f8a66', roughness: 1 }),
  rope: () => surfaceMaterial('planks-light', { scale: 0.5, tint: '#b49b6c', roughness: 1 }),
  bark: () => surfaceMaterial('planks', { scale: 1, tint: '#6d5a48', roughness: 1 }),
  needles: () => material('#2c4231', { roughness: 0.95 }),
  needlesLight: () => material('#365039', { roughness: 0.95 }),
  leaves: () => material('#3c4d2c', { roughness: 0.95 }),
  grass: () => new THREE.MeshStandardMaterial({ color: '#6a7742', roughness: 1, side: THREE.DoubleSide }),
  lantern: () => material('#ffd9a0', { emissive: '#ffb860', emissiveIntensity: 3.2 }),
  red: () => material('#a24a30', { roughness: 0.6 }),
  white: () => surfaceMaterial('planks-light', { scale: 1, tint: '#d9d4c8', roughness: 0.7 }),
};

// ── Geometry builders ─────────────────────────────────────────────────────────────────────────

/** Barrel with bulging staves (lathe profile). */
function barrelBody(h: number, r: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const y = (i / 10) * h;
    const bulge = Math.sin((i / 10) * Math.PI) * 0.12 * r;
    pts.push(new THREE.Vector2(r * 0.86 + bulge, y));
  }
  pts.unshift(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(pts, 16);
}

function hoops(h: number, r: number, at: number[]): THREE.BufferGeometry {
  return merge(
    at.map((f) => {
      const bulge = Math.sin(f * Math.PI) * 0.12 * r;
      return t(new THREE.TorusGeometry(r * 0.86 + bulge + 0.006, 0.018, 4, 18), (g) => {
        g.rotateX(Math.PI / 2);
        g.translate(0, f * h, 0);
      });
    }),
  )!;
}

/** Open wooden hull (stern at -x, bow at +x) with thwarts; double-sided so the inside shows. */
function hullGeometry(length: number, beam: number, depth: number): THREE.BufferGeometry {
  const segU = 18;
  const segV = 10;
  const positions: number[] = [];
  const point = (u: number, v: number) => {
    const s = u / segU; // 0 stern .. 1 bow
    const half = (beam / 2) * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * s)), 0.55) * (s > 0.92 ? (1 - s) / 0.08 : 1);
    const d = depth * (0.82 + 0.18 * Math.sin(Math.PI * s));
    const theta = (v / segV) * Math.PI;
    const sheer = 0.12 * Math.pow(Math.abs(s - 0.45) * 2, 2);
    return new THREE.Vector3((s - 0.5) * length, -Math.sin(theta) * d + depth + sheer, Math.cos(theta) * half);
  };
  for (let u = 0; u < segU; u += 1) {
    for (let v = 0; v < segV; v += 1) {
      const a = point(u, v);
      const b = point(u + 1, v);
      const c = point(u, v + 1);
      const d = point(u + 1, v + 1);
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
  }
  // Transom (flat stern board).
  for (let v = 0; v < segV; v += 1) {
    const a = point(0, v);
    const b = point(0, v + 1);
    positions.push(-length / 2, depth, 0, a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** Jagged cone layer for pines (noise on the rim so they don't look like party hats). */
function pineLayer(radius: number, height: number, y: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, height, 11, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-3) continue;
    const a = Math.atan2(z, x);
    const k = 1 + (valueNoise3(Math.cos(a) * 2, y, Math.sin(a) * 2, seed) - 0.5) * 0.45;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
    if (pos.getY(i) < -height / 2 + 0.01) pos.setY(i, pos.getY(i) - (k - 1) * 0.6);
  }
  g.translate(0, y, 0);
  g.computeVertexNormals();
  return g;
}

function blob(radius: number, seed: number, squash = 0.8): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + (valueNoise3(v.x * 2.2 + seed, v.y * 2.2, v.z * 2.2, seed) - 0.5) * 0.45);
    pos.setXYZ(i, v.x, v.y * squash, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function grassTuft(): THREE.BufferGeometry {
  const random = prng(91);
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i += 1) {
    const h = 0.45 + random() * 0.55;
    const blade = new THREE.BufferGeometry();
    const w = 0.035;
    blade.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, (random() - 0.5) * 0.25, h, 0], 3));
    blade.computeVertexNormals();
    blade.rotateY(random() * Math.PI);
    blade.translate((random() - 0.5) * 0.7, 0, (random() - 0.5) * 0.7);
    blades.push(blade);
  }
  return merge(blades)!;
}

/** Primitive-built models, each facing +x (rotation is applied per instance from the prop heading). */
function partsFor(kind: PropKind): Part[] {
  switch (kind) {
    case 'crate': {
      const frame: THREE.BufferGeometry[] = [];
      for (const y of [0.04, 0.96]) {
        for (const [w, d, x, z] of [
          [1, 0.06, 0, 0.47],
          [1, 0.06, 0, -0.47],
          [0.06, 1, 0.47, 0],
          [0.06, 1, -0.47, 0],
        ] as const) {
          frame.push(box(w + 0.02, 0.08, d + 0.02, x, y, z));
        }
      }
      for (const [x, z] of [
        [0.47, 0.47],
        [-0.47, 0.47],
        [0.47, -0.47],
        [-0.47, -0.47],
      ] as const) {
        frame.push(box(0.08, 1, 0.08, x, 0.5, z));
      }
      for (const side of [-1, 1]) {
        const diag = new THREE.BoxGeometry(1.25, 0.07, 0.04);
        diag.rotateZ(Math.PI / 4);
        diag.translate(0, 0.5, side * 0.5);
        frame.push(diag);
      }
      return [
        { geometry: tinted(box(0.94, 0.94, 0.94, 0, 0.5, 0), '#ffffff'), material: M.crate(), shadow: true },
        { geometry: tinted(merge(frame)!, '#8a7356'), material: M.crate(), shadow: true },
      ];
    }
    case 'barrel':
      return [
        { geometry: barrelBody(1, 0.38), material: M.barrel(), shadow: true },
        { geometry: hoops(1, 0.38, [0.1, 0.32, 0.68, 0.9]), material: M.iron() },
      ];
    case 'fuel-barrel':
      return [
        { geometry: t(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), (g) => g.translate(0, 0.45, 0)), material: M.drum(), shadow: true },
        { geometry: hoops(0.9, 0.35, [0.02, 0.33, 0.66, 0.98]), material: M.iron() },
      ];
    case 'net': {
      const floats = merge(
        Array.from({ length: 6 }, (_, i) =>
          t(new THREE.SphereGeometry(0.07, 6, 4), (g) => g.translate(Math.cos(i * 1.1) * 0.6, 0.22 + (i % 2) * 0.08, Math.sin(i * 1.7) * 0.5)),
        ),
      )!;
      return [
        { geometry: t(blob(0.75, 3, 0.32), (g) => g.translate(0, 0.16, 0)), material: M.net(), shadow: true },
        { geometry: floats, material: M.red() },
        { geometry: t(new THREE.TorusGeometry(0.28, 0.05, 5, 14), (g) => { g.rotateX(Math.PI / 2); g.translate(0.55, 0.1, -0.35); }), material: M.rope() },
      ];
    }
    case 'rowboat': {
      const hull = hullGeometry(3.4, 1.25, 0.5);
      const seats = merge([box(0.24, 0.05, 1.05, -0.4, 0.38, 0), box(0.24, 0.05, 0.95, 0.5, 0.38, 0), box(0.22, 0.05, 0.8, -1.4, 0.4, 0)])!;
      const oars = merge([
        t(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 5), (g) => { g.rotateZ(Math.PI / 2); g.rotateY(0.12); g.translate(0.1, 0.45, 0.32); }),
        t(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 5), (g) => { g.rotateZ(Math.PI / 2); g.rotateY(-0.1); g.translate(0.05, 0.47, -0.3); }),
      ])!;
      return [
        { geometry: hull, material: M.hull(), shadow: true },
        { geometry: seats, material: M.barrel() },
        { geometry: oars, material: M.crate() },
      ];
    }
    case 'fishing-boat': {
      const hull = hullGeometry(8.2, 2.9, 1.3);
      return [
        { geometry: hull, material: M.hull(), shadow: true },
        { geometry: merge([box(2.0, 1.5, 1.8, -1.6, 2.2, 0), box(2.3, 0.12, 2.1, -1.6, 3.0, 0)])!, material: M.white(), shadow: true },
        {
          geometry: merge([
            t(new THREE.CylinderGeometry(0.07, 0.09, 5.4, 6), (g) => g.translate(1.4, 3.8, 0)),
            t(new THREE.CylinderGeometry(0.04, 0.04, 3, 5), (g) => { g.rotateZ(Math.PI / 2.4); g.translate(2.5, 3.0, 0); }),
          ])!,
          material: M.bark(),
        },
        { geometry: box(1.2, 0.5, 1.6, 2.6, 1.55, 0), material: M.net() },
      ];
    }
    case 'lamp-post':
      return [
        {
          geometry: merge([
            t(new THREE.CylinderGeometry(0.16, 0.2, 0.35, 8), (g) => g.translate(0, 0.17, 0)),
            t(new THREE.CylinderGeometry(0.05, 0.075, 3.7, 8), (g) => g.translate(0, 2.2, 0)),
            t(new THREE.TorusGeometry(0.28, 0.03, 4, 10, Math.PI / 2), (g) => g.translate(-0.28, 3.9, 0)),
            box(0.34, 0.06, 0.34, 0, 4.36, 0),
            t(new THREE.ConeGeometry(0.26, 0.24, 4), (g) => { g.rotateY(Math.PI / 4); g.translate(0, 4.5, 0); }),
          ])!,
          material: M.iron(),
          shadow: true,
        },
        { geometry: box(0.24, 0.32, 0.24, 0, 4.16, 0), material: M.lantern() },
      ];
    case 'tree-pine':
      return [
        { geometry: t(new THREE.CylinderGeometry(0.14, 0.24, 2.6, 7), (g) => g.translate(0, 1.3, 0)), material: M.bark(), shadow: true },
        { geometry: merge([pineLayer(2.1, 2.9, 2.9, 1), pineLayer(1.65, 2.6, 4.5, 2)])!, material: M.needles(), shadow: true },
        { geometry: merge([pineLayer(1.2, 2.3, 6.0, 3), pineLayer(0.7, 1.8, 7.3, 4)])!, material: M.needlesLight(), shadow: true },
      ];
    case 'tree-oak':
      return [
        { geometry: t(new THREE.CylinderGeometry(0.2, 0.32, 2.8, 7), (g) => g.translate(0, 1.4, 0)), material: M.bark(), shadow: true },
        { geometry: merge([t(blob(1.8, 5), (g) => g.translate(0, 4, 0)), t(blob(1.3, 6), (g) => g.translate(1, 3.4, 0.6)), t(blob(1.2, 7), (g) => g.translate(-0.9, 3.6, -0.5))])!, material: M.leaves(), shadow: true },
      ];
    case 'bush':
      return [{ geometry: merge([t(blob(0.75, 11, 0.75), (g) => g.translate(0, 0.5, 0)), t(blob(0.55, 12, 0.8), (g) => g.translate(0.5, 0.4, 0.3)), t(blob(0.5, 13, 0.8), (g) => g.translate(-0.45, 0.35, -0.25))])!, material: M.leaves(), shadow: true }];
    case 'rock':
      return [];
    case 'tall-grass':
      return [{ geometry: grassTuft(), material: M.grass() }];
    case 'antenna': {
      const lattice: THREE.BufferGeometry[] = [];
      for (const [x, z] of [
        [0.18, 0],
        [-0.09, 0.16],
        [-0.09, -0.16],
      ] as const) {
        lattice.push(t(new THREE.CylinderGeometry(0.03, 0.04, 9, 4), (g) => g.translate(x, 4.5, z)));
      }
      for (let y = 0.6; y < 9; y += 0.9) lattice.push(t(new THREE.TorusGeometry(0.17, 0.015, 3, 3), (g) => { g.rotateX(Math.PI / 2); g.translate(0, y, 0); }));
      lattice.push(box(1.6, 0.05, 0.05, 0, 7.5, 0));
      return [
        { geometry: merge(lattice)!, material: M.iron() },
        { geometry: t(new THREE.SphereGeometry(0.12, 6, 4), (g) => g.translate(0, 9.05, 0)), material: material('#ff5040', { emissive: '#ff3020', emissiveIntensity: 3 }) },
      ];
    }
    case 'gun':
      return [
        {
          geometry: merge([
            t(new THREE.CylinderGeometry(0.11, 0.15, 3.6, 10), (g) => { g.rotateZ(Math.PI / 2 - 0.12); g.translate(1.6, 1.35, 0); }),
            t(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 10), (g) => { g.rotateZ(Math.PI / 2 - 0.12); g.translate(-0.1, 1.15, 0); }),
            box(0.9, 0.55, 0.6, -0.35, 1.05, 0),
            box(0.12, 1.15, 1.9, 0.45, 1.15, 0),
            box(0.4, 0.5, 0.9, 0, 0.55, 0),
            t(new THREE.BoxGeometry(2.4, 0.16, 0.16), (g) => { g.rotateY(0.35); g.translate(-1.3, 0.35, 0.42); }),
            t(new THREE.BoxGeometry(2.4, 0.16, 0.16), (g) => { g.rotateY(-0.35); g.translate(-1.3, 0.35, -0.42); }),
          ])!,
          material: M.olive(),
          shadow: true,
        },
        {
          geometry: merge([-0.75, 0.75].map((z) => t(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 14), (g) => { g.rotateX(Math.PI / 2); g.translate(0.05, 0.5, z); })))!,
          material: M.iron(),
          shadow: true,
        },
      ];
    case 'truck':
      return [
        { geometry: merge([box(1.6, 1.5, 2.2, 1.7, 1.3, 0), box(1.0, 0.7, 2.1, 2.7, 0.95, 0), box(4.6, 0.25, 2.2, 0, 0.62, 0)])!, material: M.olive(), shadow: true },
        { geometry: t(new THREE.CylinderGeometry(1.15, 1.15, 3, 12, 1, false, 0, Math.PI), (g) => { g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2); g.scale(1, 0.9, 0.98); g.translate(-0.75, 1.05, 0); }), material: M.canvas(), shadow: true },
        { geometry: box(1.62, 0.5, 2.12, 1.85, 1.75, 0), material: material('#1a2026', { roughness: 0.2 }) },
        {
          geometry: merge([-1.4, 1.75].flatMap((x) => [-1.05, 1.05].map((z) => t(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 12), (g) => { g.rotateX(Math.PI / 2); g.translate(x, 0.45, z); }))))!,
          material: material('#1f2123', { roughness: 0.9 }),
          shadow: true,
        },
      ];
    case 'buoy':
      return [
        { geometry: merge([t(new THREE.CylinderGeometry(0.32, 0.5, 1.0, 10), (g) => g.translate(0, 0.3, 0)), t(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 4), (g) => g.translate(0, 1.1, 0))])!, material: M.red() },
        { geometry: t(new THREE.SphereGeometry(0.11, 8, 6), (g) => g.translate(0, 1.55, 0)), material: material('#ffeec0', { emissive: '#ffe080', emissiveIntensity: 4 }) },
      ];
    case 'bollard':
      return [{ geometry: merge([t(new THREE.CylinderGeometry(0.16, 0.2, 0.6, 10), (g) => g.translate(0, 0.3, 0)), t(new THREE.CylinderGeometry(0.22, 0.17, 0.12, 10), (g) => g.translate(0, 0.62, 0))])!, material: M.iron(), shadow: true }];
    case 'bench':
      return [{ geometry: merge([box(1.6, 0.06, 0.4, 0, 0.45, 0), box(0.06, 0.45, 0.35, -0.7, 0.22, 0), box(0.06, 0.45, 0.35, 0.7, 0.22, 0)])!, material: M.crate() }];
    case 'sandbag':
      return [{ geometry: box(0.62, 0.24, 0.34, 0, 0.12, 0), material: M.canvas() }];
    case 'searchlight':
      return [];
  }
}

const FLOATING: ReadonlySet<PropKind> = new Set(['rowboat', 'fishing-boat', 'buoy']);
/** Painted hull colours for boats (instance tint), like the moored boats in the concept art. */
const HULL_TINTS = ['#c9c2b4', '#5b7183', '#8a3f30', '#b8b29e', '#3f5c4d'];

function PropKindInstances({ kind, props, grid, seaLevel }: { kind: PropKind; props: PropDef[]; grid: Grid; seaLevel: number }) {
  const parts = useMemo(() => partsFor(kind), [kind]);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    props.forEach((p, i) => {
      const cell = grid.cellAt(p.pos);
      const wet = cell >= 0 && (grid.hasFlag(cell, CellFlag.Deep) || grid.hasFlag(cell, CellFlag.Shallow));
      const floating = FLOATING.has(kind) && wet;
      const y = floating ? seaLevel - (kind === 'rowboat' ? 0.3 : 0.55) : grid.heightAt(p.pos);
      dummy.position.set(p.pos.x, y, p.pos.z);
      const roll = floating ? (hash2(Math.round(p.pos.x * 7), Math.round(p.pos.z * 7), 3) - 0.5) * 0.08 : 0;
      dummy.rotation.set(roll, -p.rotation, 0);
      const wobble = kind.startsWith('tree') ? 1 + (hash2(Math.round(p.pos.x * 10), Math.round(p.pos.z * 10), 7) - 0.5) * 0.16 : 1;
      dummy.scale.set(p.scale, p.scale * wobble, p.scale);
      dummy.updateMatrix();
      for (const [j, mesh] of refs.current.entries()) {
        if (!mesh) continue;
        mesh.setMatrixAt(i, dummy.matrix);
        // Per-instance shade: hull paint for boats, gentle variation for everything else.
        if (FLOATING.has(kind) && j === 0) color.set(HULL_TINTS[Math.floor(hash2(i, 5, 13) * HULL_TINTS.length)]!);
        else color.setScalar(0.85 + hash2(Math.round(p.pos.x * 3), Math.round(p.pos.z * 3), j) * 0.3);
        mesh.setColorAt(i, color);
      }
    });
    for (const mesh of refs.current) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

/** Render-only dressing (rope coils, baskets, small crates, bollards) along quays and walls. */
function decorProps(level: LevelData): PropDef[] {
  const grid = new Grid(level);
  const random = prng(level.seed ^ 0xdec0);
  const out: PropDef[] = [];
  const occupied = (x: number, z: number, r: number) => level.props.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < r) || out.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < r);
  // Bollards along the quay edge every ~6 m, set back from the coping.
  for (let cell = 0; cell < level.cols * level.rows; cell += 1) {
    if (level.surface[cell] !== Surface.Stone) continue;
    const col = cell % level.cols;
    const row = (cell - col) / level.cols;
    const north = row > 0 ? (row - 1) * level.cols + col : -1;
    if (north < 0 || !(level.flags[north]! & CellFlag.Deep)) continue;
    const c = grid.center(cell);
    if (Math.round(c.x * 2) % 12 !== 0 || occupied(c.x, c.z, 1.2)) continue;
    out.push({ id: `decor-bollard-${out.length}`, kind: 'bollard', pos: { x: c.x, z: c.z + 0.6 }, rotation: 0, scale: 1, height: 0.7, solid: false });
    if (random() < 0.5) out.push({ id: `decor-net-${out.length}`, kind: 'net', pos: { x: c.x + 1.4, z: c.z + 1.1 }, rotation: random() * 6.28, scale: 0.7, height: 0.4, solid: false });
  }
  return out;
}

/** All level props, instanced per kind and part (one draw call per part type). */
export function Props({ level }: { level: LevelData }) {
  const grid = useMemo(() => new Grid(level), [level]);
  const byKind = useMemo(() => {
    const map = new Map<PropKind, PropDef[]>();
    for (const p of [...level.props, ...decorProps(level)]) {
      if (p.kind === 'rock') continue; // rendered with the faceted rocks (rocks.tsx)
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
