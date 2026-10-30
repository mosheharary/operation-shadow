'use client';

import { TARGET_HEIGHT } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { GameController } from '../runtime/controller';
import { useSettings } from '../runtime/settings';
import { clearRim, dangerLevel, edgeMarker, type RimMarker, rimFrame, type SightlineStage, sightlines } from '../runtime/sightlines';
import { useGameUi } from '../runtime/store';
import { CONE_COLORS } from './overlay';

const MAX_THREADS = 12;
/** Off-screen watchers the rim marks at most (the strongest). */
const MAX_MARKERS = 4;
/** Thread radius at the default camera distance; it widens as the camera pulls back so it stays a few pixels. */
const RADIUS = 0.045;
/** Keeps edge markers inside the screen and clear of the portrait row and the ability bar. */
const EDGE_INSETS = { side: 46, top: 140, bottom: 110 };

/** Pale while a sentry is only looking, then the cone colours as he makes up his mind. */
function stageColor(stage: SightlineStage, palette: 'standard' | 'colorblind'): string {
  const colors = CONE_COLORS[palette];
  if (stage === 'watch') return '#efe4c2';
  if (stage === 'suspect') return colors.wary;
  return colors.alert;
}

/**
 * A thread from the eyes to the target, drawn in screen-steady dashes: the part up to the current
 * suspicion is lit and runs toward the target, a bead marks how far the call has crept, and the
 * rest is a faint dotted guide. A watcher who has lost sight leaves a dim, broken thread.
 */
function threadMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color('#efe4c2') },
      uLevel: { value: 0 },
      uLength: { value: 1 },
      uTime: { value: 0 },
      uSeeing: { value: 1 },
    },
    vertexShader: `
      varying float vAlong;
      void main() {
        vAlong = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uLevel;
      uniform float uLength;
      uniform float uTime;
      uniform float uSeeing;
      varying float vAlong;
      void main() {
        float metres = vAlong * uLength;
        float lit = step(vAlong, uLevel);
        // Pulses travel from the watcher toward the target, faster as the call gets closer.
        float run = 0.55 + 0.45 * sin((metres - uTime * (2.0 + 6.0 * uLevel)) * 2.4);
        float dotted = step(0.55, fract(metres * 1.6));
        float broken = mix(dotted, 1.0, uSeeing);
        float alpha = lit * (0.6 + 0.4 * run) * broken + (1.0 - lit) * 0.3 * dotted;
        // The leading edge glows.
        alpha += smoothstep(0.06, 0.0, abs(vAlong - uLevel)) * 0.6 * lit;
        // Fade in at the watcher's eyes so the thread grows out of him rather than starting at a hard end.
        alpha *= smoothstep(0.0, 0.04, vAlong) * mix(0.4, 1.0, uSeeing);
        // A little over 1 so the lit part catches the bloom at night.
        gl_FragColor = vec4(uColor * alpha * 1.6, alpha);
      }`,
  });
}

interface ThreadSlot {
  line: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  bead: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Watch threads between sentries and the operatives they are sizing up, plus the data for the HUD's danger rim. */
export function Sightlines({ controller }: { controller: GameController }) {
  const slots = useMemo<ThreadSlot[]>(() => {
    // A unit tube from y = 0 (the watcher) to y = 1 (the target); scaled and turned per thread.
    const tube = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    const sphere = new THREE.SphereGeometry(1, 10, 8);
    return Array.from({ length: MAX_THREADS }, () => ({
      line: Object.assign(new THREE.Mesh(tube, threadMaterial()), { name: 'sightline', renderOrder: 5, frustumCulled: false, visible: false }),
      bead: Object.assign(
        new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })),
        { renderOrder: 6, visible: false },
      ),
    }));
  }, []);
  useEffect(() => clearRim, []);

  const from = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector3(), []);
  const eye = useMemo(() => new THREE.Vector3(), []);

  useFrame((frame) => {
    const world = controller.world;
    const ui = useGameUi.getState();
    const settings = useSettings.getState();
    const enabled = settings.showSightlines && !ui.cinematic && world.state.status === 'running';
    const lines = enabled ? sightlines(world.state) : [];
    const camera = frame.camera;
    const time = frame.clock.elapsedTime;

    let used = 0;
    const markers: RimMarker[] = [];
    for (const line of lines) {
      const g = world.guard(line.guardId);
      const op = world.operative(line.targetId);
      if (!g || !op) continue;
      const gp = controller.interpolate(g.id, g.pos);
      const tp = controller.interpolate(op.id, op.pos);
      from.set(gp.x, world.grid.heightAt(gp) + 1.6 + g.eyeElevation, gp.z);
      to.set(tp.x, world.grid.heightAt(tp) + TARGET_HEIGHT[op.stance] * 0.8, tp.z);

      if (used < MAX_THREADS) {
        const slot = slots[used++]!;
        dir.subVectors(to, from);
        const length = Math.max(0.01, dir.length());
        // Keep the thread a steady few pixels thick whatever the zoom.
        eye.copy(from).lerp(to, 0.5);
        const radius = RADIUS * Math.max(1, camera.position.distanceTo(eye) / 40);
        slot.line.position.copy(from);
        slot.line.quaternion.setFromUnitVectors(UP, dir.normalize());
        slot.line.scale.set(radius, length, radius);
        const color = stageColor(line.stage, settings.palette);
        const u = slot.line.material.uniforms;
        u.uColor!.value.set(color);
        u.uLevel!.value = line.level;
        u.uLength!.value = length;
        u.uTime!.value = time;
        u.uSeeing!.value = line.seeing ? 1 : 0;
        slot.line.visible = true;
        slot.bead.position.copy(from).addScaledVector(dir, length * line.level);
        slot.bead.scale.setScalar(radius * (2.6 + Math.sin(time * (4 + 8 * line.level)) * 0.6));
        slot.bead.material.color.set(color);
        slot.bead.material.opacity = line.seeing ? 0.95 : 0.4;
        slot.bead.visible = true;
      }

      // Watchers out of view get a marker on the screen edge pointing at them.
      if (line.seeing && markers.length < MAX_MARKERS && !markers.some((m) => m.guardId === g.id)) {
        ndc.copy(from).project(camera);
        const behind = ndc.z > 1;
        const size = frame.size;
        const at = edgeMarker(ndc.x, ndc.y, behind, size.width, size.height, EDGE_INSETS);
        if (at) markers.push({ ...at, guardId: g.id, level: line.level, stage: line.stage });
      }
    }
    for (let i = used; i < slots.length; i += 1) {
      slots[i]!.line.visible = false;
      slots[i]!.bead.visible = false;
    }
    rimFrame.danger = dangerLevel(lines);
    rimFrame.markers = markers;
  });

  return (
    <group name="sightlines">
      {slots.map((slot, i) => (
        <group key={i}>
          <primitive object={slot.line} />
          <primitive object={slot.bead} />
        </group>
      ))}
    </group>
  );
}
