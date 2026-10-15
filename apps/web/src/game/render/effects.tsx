'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { requestShake } from '../camera/camera-rig';
import type { GameController } from '../runtime/controller';

interface Flash {
  pos: THREE.Vector3;
  born: number;
  life: number;
  big: boolean;
}

/** Event-driven muzzle flashes and explosions (pooled; no allocation per frame). */
export function Effects({ controller }: { controller: GameController }) {
  const flashes = useRef<Flash[]>([]);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const fireballs = useMemo(
    () => Array.from({ length: 3 }, () => new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffb050', transparent: true, depthWrite: false }))),
    [],
  );

  useEffect(
    () =>
      controller.onEvents((events) => {
        const now = performance.now();
        for (const e of events) {
          if (e.type === 'shot') {
            const y = controller.world.grid.heightAt(e.from) + 1.4;
            flashes.current.push({ pos: new THREE.Vector3(e.from.x, y, e.from.z), born: now, life: 90, big: false });
          } else if (e.type === 'explosion') {
            const y = controller.world.grid.heightAt(e.pos) + 1;
            flashes.current.push({ pos: new THREE.Vector3(e.pos.x, y, e.pos.z), born: now, life: 1400, big: true });
            requestShake(0.9);
          }
        }
        if (flashes.current.length > 8) flashes.current.splice(0, flashes.current.length - 8);
      }),
    [controller],
  );

  useFrame(() => {
    const now = performance.now();
    flashes.current = flashes.current.filter((f) => now - f.born < f.life);
    lights.current.forEach((light, i) => {
      const f = flashes.current[i];
      if (!light) return;
      light.visible = Boolean(f);
      if (!f) return;
      const t = (now - f.born) / f.life;
      light.position.copy(f.pos);
      light.intensity = (f.big ? 120 : 18) * (1 - t);
      light.distance = f.big ? 30 : 7;
    });
    const big = flashes.current.filter((f) => f.big);
    fireballs.forEach((mesh, i) => {
      const f = big[i];
      mesh.visible = Boolean(f);
      if (!f) return;
      const t = (now - f.born) / f.life;
      mesh.position.copy(f.pos);
      mesh.scale.setScalar(1 + t * 5);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(t < 0.25 ? '#ffd27a' : t < 0.5 ? '#ff8a3a' : '#5a5250');
      mat.opacity = Math.max(0, 0.95 - t);
    });
  });

  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lights.current[i] = l;
          }}
          color="#ffcf7a"
          visible={false}
          decay={1.6}
        />
      ))}
      {fireballs.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  );
}
