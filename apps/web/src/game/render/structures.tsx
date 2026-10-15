'use client';

import type { LevelData, StructureDef, Vec2 } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { material, ROOF_COLORS, WALL_COLORS } from './palette';

const BUILDING_KINDS = new Set(['house', 'office', 'warehouse', 'barracks', 'bunker', 'radio-hut']);
const WALL_T = 0.32;
const LIT_BUILDINGS = new Set(['house-1', 'house-3', 'office', 'house-5', 'barracks']);

function box(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

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

function gableRoof(s: StructureDef, rise: number): THREE.BufferGeometry {
  const overhang = 0.35;
  const alongX = s.size.x >= s.size.z;
  const span = (alongX ? s.size.z : s.size.x) + overhang * 2;
  const length = (alongX ? s.size.x : s.size.z) + overhang * 2;
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0);
  shape.lineTo(span / 2, 0);
  shape.lineTo(0, rise);
  shape.lineTo(-span / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  g.translate(0, 0, -length / 2);
  if (alongX) g.rotateY(Math.PI / 2);
  g.translate(s.pos.x, s.baseHeight + s.height, s.pos.z);
  return g;
}

interface BuildingMeshes {
  walls: Map<string, THREE.BufferGeometry[]>;
  windowsLit: THREE.BufferGeometry[];
  windowsDark: THREE.BufferGeometry[];
  roofs: { id: string; regionId: number; geometry: THREE.BufferGeometry; color: string; rect: { min: Vec2; max: Vec2 } }[];
}

function buildBuildings(level: LevelData): BuildingMeshes {
  const out: BuildingMeshes = { walls: new Map(), windowsLit: [], windowsDark: [], roofs: [] };
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
    const color = WALL_COLORS[s.material] ?? WALL_COLORS.plaster!;
    const list = out.walls.get(color) ?? [];
    out.walls.set(color, list);
    const hasWindows = s.kind === 'house' || s.kind === 'office' || s.kind === 'barracks';
    for (const run of runs) {
      const len = Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z);
      const dir = { x: (run.b.x - run.a.x) / len, z: (run.b.z - run.a.z) / len };
      const rot = -Math.atan2(dir.z, dir.x);
      for (const piece of wallPieces(run, openings)) {
        const mid = (piece.from + piece.to) / 2;
        const cx = run.a.x + dir.x * mid;
        const cz = run.a.z + dir.z * mid;
        const plen = piece.to - piece.from;
        if (piece.door) {
          // Lintel above the doorway.
          const lintel = 2.25;
          list.push(box(plen, s.height - lintel, WALL_T, cx, s.baseHeight + lintel + (s.height - lintel) / 2, cz, rot));
        } else {
          list.push(box(plen + WALL_T * 0.5, s.height, WALL_T, cx, s.baseHeight + s.height / 2, cz, rot));
        }
      }
      if (hasWindows) {
        // Panes centred on the gameplay window bands (every other 2 m stretch).
        for (let t = 3; t < len - 1; t += 4) {
          const nearDoor = openings.some((o) => Math.hypot(o.pos.x - (run.a.x + dir.x * t), o.pos.z - (run.a.z + dir.z * t)) < 1.6);
          if (nearDoor) continue;
          const px = run.a.x + dir.x * t;
          const pz = run.a.z + dir.z * t;
          const normal = { x: dir.z, z: -dir.x };
          // Clockwise wall runs: +normal points outward.
          const pane = box(1.0, 0.85, 0.06, px + normal.x * 0.17, s.baseHeight + 1.45, pz + normal.z * 0.17, rot);
          (LIT_BUILDINGS.has(s.id) ? out.windowsLit : out.windowsDark).push(pane);
        }
      }
    }
    const roof = s.roof === 'gable' ? gableRoof(s, s.kind === 'warehouse' ? 1.8 : 1.5) : box(s.size.x + 0.5, 0.3, s.size.z + 0.5, s.pos.x, s.baseHeight + s.height + 0.15, s.pos.z);
    out.roofs.push({ id: s.id, regionId: s.regionId ?? 0, geometry: roof, color: s.roof === 'gable' ? ROOF_COLORS.gable : ROOF_COLORS.flat, rect: { min, max } });
  }
  return out;
}

function buildFortifications(level: LevelData): { geometry: THREE.BufferGeometry; color: string }[] {
  const byColor = new Map<string, THREE.BufferGeometry[]>();
  const add = (color: string, g: THREE.BufferGeometry) => {
    const list = byColor.get(color) ?? [];
    list.push(g);
    byColor.set(color, list);
  };
  for (const s of level.structures) {
    if (s.kind === 'pier') {
      add('#6a5234', box(s.size.x, 0.25, s.size.z, s.pos.x, s.height - 0.12, s.pos.z));
      for (let z = s.pos.z - s.size.z / 2 + 0.6; z < s.pos.z + s.size.z / 2; z += 2) {
        for (const side of [-1, 1]) {
          const g = new THREE.CylinderGeometry(0.12, 0.14, 5, 6);
          g.translate(s.pos.x + side * (s.size.x / 2 - 0.2), s.height - 2.6, z);
          add('#4d3a26', g);
        }
      }
    } else if (s.kind === 'fence' && s.path && s.path.length >= 2) {
      const a = s.path[0]!;
      const b = s.path[1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
      const gaps = (s.doors ?? []).map((d) => (d.x - a.x) * dir.x + (d.z - a.z) * dir.z);
      for (let t = 0; t <= len + 0.01; t += 2.5) {
        if (gaps.some((g) => Math.abs(g - t) < 1.6)) continue;
        const post = new THREE.CylinderGeometry(0.05, 0.05, s.height, 5);
        post.translate(a.x + dir.x * t, s.baseHeight + s.height / 2, a.z + dir.z * t);
        add('#5d6164', post);
      }
      // Top rail (barbed wire), broken at the gate.
      const pieces = wallPieces({ a, b }, (s.doors ?? []).map((pos) => ({ pos, width: 3.6 })));
      for (const piece of pieces) {
        if (piece.door) continue;
        const mid = (piece.from + piece.to) / 2;
        add('#3f4245', box(piece.to - piece.from, 0.04, 0.04, a.x + dir.x * mid, s.baseHeight + s.height, a.z + dir.z * mid, -Math.atan2(dir.z, dir.x)));
      }
    } else if (s.kind === 'gun-emplacement') {
      const r = s.size.x / 2;
      for (let i = 0; i < 10; i += 1) {
        if (i === 2 || i === 3) continue;
        const angle = ((i + 0.5) / 10) * Math.PI * 2;
        add(WALL_COLORS.sandbag!, box(2.1, 1.1, 0.7, s.pos.x + Math.cos(angle) * r, s.baseHeight + 0.55, s.pos.z + Math.sin(angle) * r, -angle + Math.PI / 2));
      }
      const floor = new THREE.CylinderGeometry(r - 0.3, r - 0.3, 0.12, 20);
      floor.translate(s.pos.x, s.baseHeight + 0.06, s.pos.z);
      add('#7b7a73', floor);
    } else if (s.kind === 'watchtower') {
      for (const [dx, dz] of [
        [-1.2, -1.2],
        [1.2, -1.2],
        [-1.2, 1.2],
        [1.2, 1.2],
      ] as const) {
        add('#4b3c2b', box(0.2, s.height, 0.2, s.pos.x + dx, s.baseHeight + s.height / 2, s.pos.z + dz));
      }
      add('#5a4a36', box(3.2, 0.25, 3.2, s.pos.x, s.baseHeight + 5.1, s.pos.z));
      for (const [dx, dz, w, d] of [
        [0, -1.55, 3.2, 0.08],
        [0, 1.55, 3.2, 0.08],
        [-1.55, 0, 0.08, 3.2],
        [1.55, 0, 0.08, 3.2],
      ] as const) {
        add('#5a4a36', box(w, 0.9, d, s.pos.x + dx, s.baseHeight + 5.7, s.pos.z + dz));
      }
      const roof = new THREE.ConeGeometry(2.6, 1.4, 4);
      roof.rotateY(Math.PI / 4);
      roof.translate(s.pos.x, s.baseHeight + 7.3, s.pos.z);
      add('#3b352f', roof);
    } else if (s.kind === 'sandbags') {
      add(WALL_COLORS.sandbag!, box(Math.max(0.7, s.size.x), s.height, Math.max(0.7, s.size.z), s.pos.x, s.baseHeight + s.height / 2, s.pos.z));
    }
  }
  return [...byColor.entries()].map(([color, list]) => ({ geometry: mergeGeometries(list)!, color }));
}

/** Chain-link panels rendered as a translucent mesh between fence posts. */
function buildFencePanels(level: LevelData): THREE.BufferGeometry | null {
  const panels: THREE.BufferGeometry[] = [];
  for (const s of level.structures) {
    if (s.kind !== 'fence' || !s.path || s.path.length < 2) continue;
    const a = s.path[0]!;
    const b = s.path[1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    for (const piece of wallPieces({ a, b }, (s.doors ?? []).map((pos) => ({ pos, width: 3.6 })))) {
      if (piece.door) continue;
      const mid = (piece.from + piece.to) / 2;
      const g = new THREE.PlaneGeometry(piece.to - piece.from, s.height * 0.95);
      g.rotateY(-Math.atan2(dir.z, dir.x));
      g.translate(a.x + dir.x * mid, s.baseHeight + s.height * 0.48, a.z + dir.z * mid);
      panels.push(g);
    }
  }
  return panels.length ? mergeGeometries(panels) : null;
}

export interface StructuresProps {
  level: LevelData;
  /** Region ids whose roofs are lifted away this frame (buildings with squad members inside, hovered). */
  cutawayRegions: () => Set<number>;
}

export function Structures({ level, cutawayRegions }: StructuresProps) {
  const buildings = useMemo(() => buildBuildings(level), [level]);
  const fortifications = useMemo(() => buildFortifications(level), [level]);
  const fencePanels = useMemo(() => buildFencePanels(level), [level]);
  const merged = useMemo(
    () => ({
      walls: [...buildings.walls.entries()].map(([color, list]) => ({ color, geometry: mergeGeometries(list)! })),
      lit: buildings.windowsLit.length ? mergeGeometries(buildings.windowsLit) : null,
      dark: buildings.windowsDark.length ? mergeGeometries(buildings.windowsDark) : null,
    }),
    [buildings],
  );
  const roofRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const hidden = cutawayRegions();
    buildings.roofs.forEach((roof, i) => {
      const mesh = roofRefs.current[i];
      if (mesh) mesh.visible = !hidden.has(roof.regionId);
    });
  });

  return (
    <group name="structures">
      {merged.walls.map(({ color, geometry }) => (
        <mesh key={color} geometry={geometry} material={material(color, { roughness: 0.92 })} castShadow receiveShadow />
      ))}
      {merged.lit && <mesh geometry={merged.lit} material={material('#2a2216', { emissive: '#ffb860', emissiveIntensity: 1.35 })} />}
      {merged.dark && <mesh geometry={merged.dark} material={material('#1c2228', { roughness: 0.3, metalness: 0.2 })} />}
      {buildings.roofs.map((roof, i) => (
        <mesh
          key={roof.id}
          ref={(m) => {
            roofRefs.current[i] = m;
          }}
          geometry={roof.geometry}
          material={material(roof.color, { roughness: 0.8 })}
          castShadow
          receiveShadow
        />
      ))}
      {fortifications.map(({ color, geometry }) => (
        <mesh key={color} geometry={geometry} material={material(color)} castShadow receiveShadow />
      ))}
      {fencePanels && (
        <mesh geometry={fencePanels} material={material('#9aa0a4', { transparent: true, opacity: 0.22, roughness: 0.6 })} />
      )}
    </group>
  );
}
