'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { requestShake } from '../camera/camera-rig';
import { BEAT_STYLES, beatFrame, type BeatTone } from '../runtime/beats';
import type { GameController } from '../runtime/controller';
import { edgeMarker } from '../runtime/sightlines';

/** Clear of the status bar along the top and the ability bar along the bottom. */
const EDGE_INSETS = { side: 150, top: 170, bottom: 150 };
/** How long the ground shockwave runs (ms) and how far it spreads (metres). */
const RING_MS = 900;
const RING_RADIUS = 7;

export const BEAT_COLORS: Record<BeatTone, string> = {
  quiet: '#d9d2bd',
  good: '#9fd68a',
  warning: '#f0b450',
  danger: '#ff5a48',
};

/**
 * The scene's half of a turning point (see runtime/beats.ts): a shockwave that runs out across the
 * ground from where it happened, a jolt of the camera for a casualty, and the spot projected to the
 * screen for the HUD's stamp.
 */
export function Beats({ controller }: { controller: GameController }) {
  const ring = useMemo(() => {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 7;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }, []);
  const point = useMemo(() => new THREE.Vector3(), []);
  const shaken = useMemo(() => ({ id: 0 }), []);

  useFrame(({ camera, size }) => {
    const now = performance.now();
    const beat = controller.beats.showing(now);
    if (!beat || !beat.pos) {
      ring.visible = false;
      beatFrame.edge = false;
      beatFrame.x = size.width / 2;
      beatFrame.y = size.height * 0.36;
      return;
    }
    if (shaken.id !== beat.id) {
      shaken.id = beat.id;
      if (beat.kind === 'down' || beat.kind === 'lost') requestShake(0.35);
    }
    const y = controller.world.grid.heightAt(beat.pos);
    const t = (now - beat.at) / RING_MS;
    ring.visible = t < 1;
    if (ring.visible) {
      const ease = 1 - (1 - t) * (1 - t);
      ring.position.set(beat.pos.x, y + 0.08, beat.pos.z);
      ring.scale.setScalar(0.6 + ease * RING_RADIUS * (BEAT_STYLES[beat.kind].rank >= 5 ? 1.6 : 1));
      const material = ring.material as THREE.MeshBasicMaterial;
      material.color.set(BEAT_COLORS[beat.tone]);
      material.opacity = 0.85 * (1 - t);
    }
    // The stamp sits a little above the spot, where a figure's head would be.
    point.set(beat.pos.x, y + 2.2, beat.pos.z).project(camera);
    const at = edgeMarker(point.x, point.y, point.z > 1, size.width, size.height, EDGE_INSETS);
    if (at) {
      beatFrame.edge = true;
      beatFrame.x = at.x;
      beatFrame.y = at.y;
      beatFrame.angle = at.angle;
    } else {
      beatFrame.edge = false;
      beatFrame.x = (point.x * 0.5 + 0.5) * size.width;
      beatFrame.y = (-point.y * 0.5 + 0.5) * size.height;
    }
  });

  return <primitive object={ring} />;
}
