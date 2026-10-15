'use client';

import { Grid, type LevelData } from '@operation-shadow/engine';
import { useMemo } from 'react';
import * as THREE from 'three';

let glowTexture: THREE.Texture | null = null;

/** Soft radial glow (shared by lamp halos and lanterns). */
export function glowMap(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,236,200,1)');
  g.addColorStop(0.25, 'rgba(255,196,120,0.55)');
  g.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/** Additive halo sprite for a light source (bloom turns these into the concept's warm haze). */
export function glowSprite(size: number, color = '#ffc98a', opacity = 0.85): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 6;
  return sprite;
}

/** Halos around the static lamps of the level, drawn as one point cloud. */
export function LampGlows({ level }: { level: LevelData }) {
  const points = useMemo(() => {
    const grid = new Grid(level);
    const lamps = level.lights.filter((l) => l.kind === 'lamp');
    const positions = new Float32Array(lamps.length * 3);
    lamps.forEach((l, i) => {
      // The lantern box of the lamp-post prop sits at 4.16 m.
      positions.set([l.pos.x, grid.heightAt(l.pos) + 4.16, l.pos.z], i * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ map: glowMap(), size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffc98a', opacity: 0.9 });
    const object = new THREE.Points(geometry, material);
    object.renderOrder = 6;
    return { object, lamps };
  }, [level]);
  return <primitive object={points.object} />;
}
