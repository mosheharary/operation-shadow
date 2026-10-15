import { CellFlag, type Vec2, type World } from '@operation-shadow/engine';
import * as THREE from 'three';
import type { PointerTarget } from './context-action';

const STEP = 0.4;
const MAX_DISTANCE = 420;

/** Height of whatever a pointer ray lands on: terrain, pier decks or the water surface. */
export function surfaceHeight(world: World, x: number, z: number): number {
  const pos = { x, z };
  const cell = world.grid.cellAt(pos);
  let y = world.grid.heightAt(pos);
  if (cell < 0) return y;
  const deck = world.level.cellHeight[cell]!;
  if (deck > y + 0.3) y = deck;
  if (world.grid.hasFlag(cell, CellFlag.Deep) || world.grid.hasFlag(cell, CellFlag.Shallow)) y = Math.max(y, world.level.seaLevel);
  return y;
}

/**
 * Marches a ray across the level surface and refines the first crossing. Returns null when the
 * ray leaves the map without landing (sky, beyond the edges).
 */
export function pickGround(world: World, ray: THREE.Ray): Vec2 | null {
  const { origin, direction } = ray;
  if (direction.y >= -1e-4) return null;
  const { width, depth } = world.level;
  let prevT = 0;
  for (let t = STEP; t < MAX_DISTANCE; t += STEP) {
    const x = origin.x + direction.x * t;
    const z = origin.z + direction.z * t;
    const y = origin.y + direction.y * t;
    if (y <= surfaceHeight(world, x, z)) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 8; i += 1) {
        const mid = (lo + hi) / 2;
        const mx = origin.x + direction.x * mid;
        const mz = origin.z + direction.z * mid;
        if (origin.y + direction.y * mid <= surfaceHeight(world, mx, mz)) hi = mid;
        else lo = mid;
      }
      const px = origin.x + direction.x * hi;
      const pz = origin.z + direction.z * hi;
      if (px < 0 || pz < 0 || px >= width || pz >= depth) return null;
      return { x: px, z: pz };
    }
    prevT = t;
  }
  return null;
}

/** Nearest visible pickable entity (unit hitboxes and world objects carry `userData.kind`). */
export function pickEntity(raycaster: THREE.Raycaster, scene: THREE.Scene): PointerTarget {
  const candidates: THREE.Object3D[] = [];
  scene.traverseVisible((object) => {
    const data = object.userData as { id?: string; kind?: string };
    if (data.id && data.kind && (object as THREE.Mesh).isMesh) candidates.push(object);
  });
  const hits = raycaster.intersectObjects(candidates, false);
  for (const hit of hits) {
    const data = hit.object.userData as { id: string; kind: 'operative' | 'guard' | 'object' };
    return { kind: data.kind, id: data.id };
  }
  return null;
}

/** Projects a world point to canvas pixel coordinates. */
export function toScreen(camera: THREE.Camera, rect: { width: number; height: number }, x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height, visible: v.z > -1 && v.z < 1 };
}
