'use client';

import { ABILITIES, type AbilityId, NOISE_DB } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameController } from '../runtime/controller';
import { useGameUi } from '../runtime/store';
import { ringRadius } from './overlay';

/** How loud each thrown or planted ability is where it lands (dB at 1 m). */
const LANDING_NOISE: Partial<Record<AbilityId, number>> = {
  'throw-stone': NOISE_DB.impact,
  smoke: 55,
  'place-charge': NOISE_DB.explosion,
};

/**
 * While aiming an ability: the reach of ranged and thrown abilities around the operative, and for
 * noisy ones, how far the sound will carry from the landing point (the same radius the AI hears).
 */
export function TargetingPreview({ controller }: { controller: GameController }) {
  const range = useRef<THREE.Mesh>(null);
  const noise = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2), []);

  useFrame(() => {
    const ui = useGameUi.getState();
    const world = controller.world;
    const lead = ui.selected.map((id) => world.operative(id)).find((op) => op?.status === 'active');
    const def = ui.targeting ? ABILITIES[ui.targeting] : null;
    const ok = ui.contextHint?.ok ?? true;

    const ring = range.current;
    if (ring) {
      const show = Boolean(lead && def && !def.approach && def.range > 0 && def.range < 100);
      ring.visible = show;
      if (show && lead && def) {
        const pos = controller.interpolate(lead.id, lead.pos);
        ring.position.set(pos.x, world.grid.heightAt(pos) + 0.1, pos.z);
        ring.scale.set(def.range, 1, def.range);
        (ring.material as THREE.MeshBasicMaterial).color.set(ok ? '#e7c35a' : '#ff5a3c');
      }
    }

    const sound = noise.current;
    if (sound) {
      const db = ui.targeting ? LANDING_NOISE[ui.targeting] : undefined;
      const at = ui.groundPoint;
      sound.visible = Boolean(db && at);
      if (db && at) {
        const r = ringRadius(db, world.state.env.noiseFloor);
        sound.position.set(at.x, world.grid.heightAt(at) + 0.12, at.z);
        sound.scale.set(r, 1, r);
      }
    }
  });

  return (
    <>
      <mesh ref={range} geometry={geometry} renderOrder={3} visible={false}>
        <meshBasicMaterial transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh ref={noise} geometry={geometry} renderOrder={3} visible={false}>
        <meshBasicMaterial color="#f0b44a" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </>
  );
}

/** Pulsing ring and light pillar where the tutorial wants the player to go. */
export function TutorialMarker({ controller }: { controller: GameController }) {
  const ring = useRef<THREE.Mesh>(null);
  const pillar = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), []);
  const pillarGeometry = useMemo(() => new THREE.CylinderGeometry(0.9, 0.9, 6, 24, 1, true).translate(0, 3, 0), []);
  useFrame((frame) => {
    const pos = useGameUi.getState().tutorialMarker;
    const t = frame.clock.elapsedTime;
    for (const mesh of [ring.current, pillar.current]) {
      if (!mesh) continue;
      mesh.visible = Boolean(pos);
      if (pos) mesh.position.set(pos.x, controller.world.grid.heightAt(pos) + 0.12, pos.z);
    }
    if (ring.current) ring.current.scale.setScalar(1.6 + Math.sin(t * 3) * 0.25);
  });
  return (
    <>
      <mesh ref={ring} geometry={geometry} renderOrder={5} visible={false}>
        <meshBasicMaterial color="#7fd6ff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={pillar} geometry={pillarGeometry} renderOrder={5} visible={false}>
        <meshBasicMaterial color="#7fd6ff" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  );
}
