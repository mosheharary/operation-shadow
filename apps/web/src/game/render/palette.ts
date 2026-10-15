import { Surface } from '@operation-shadow/engine';
import * as THREE from 'three';

/** Miniature-diorama palette (approved art direction): muted slate, olive, weathered stone, rust. */
export const SURFACE_COLORS: Record<Surface, string> = {
  [Surface.Grass]: '#45502f',
  [Surface.Dirt]: '#5c4b36',
  [Surface.Gravel]: '#6b675d',
  [Surface.Sand]: '#9c8d6b',
  [Surface.Snow]: '#d9dee1',
  [Surface.Mud]: '#4b3e2f',
  [Surface.Stone]: '#64625b',
  [Surface.Concrete]: '#7b7a73',
  [Surface.Wood]: '#6d5235',
  [Surface.Metal]: '#5b6064',
  [Surface.ShallowWater]: '#3e5560',
  [Surface.DeepWater]: '#24323a',
  [Surface.Rock]: '#5d5b55',
};

export const ROCK_COLOR = '#56544f';

export const WALL_COLORS: Record<string, string> = {
  plaster: '#b8ad96',
  stone: '#8d8a82',
  brick: '#8b5b49',
  timber: '#6f5b45',
  concrete: '#8a8983',
  wood: '#7a6248',
  metal: '#6b7075',
  chainlink: '#7d8285',
  sandbag: '#8a7d5e',
};

export const ROOF_COLORS = { gable: '#474b52', flat: '#3c3c3a' } as const;

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared standard material per colour/finish (avoids one material per mesh). */
export function material(color: string, options: { roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${JSON.stringify(options)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.85,
      metalness: options.metalness ?? 0,
      ...(options.emissive ? { emissive: new THREE.Color(options.emissive), emissiveIntensity: options.emissiveIntensity ?? 1 } : {}),
      ...(options.transparent ? { transparent: true, opacity: options.opacity ?? 0.5, depthWrite: false } : {}),
    });
    cache.set(key, m);
  }
  return m;
}

/** Deterministic per-position jitter in [-1, 1] for colour variation. */
export function jitter(x: number, z: number, salt = 0): number {
  let h = (Math.imul(Math.floor(x * 7.3) | 0, 374761393) + Math.imul(Math.floor(z * 5.1) | 0, 668265263) + salt) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
}
