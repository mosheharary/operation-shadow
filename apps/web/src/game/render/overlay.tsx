'use client';

import { audibleRadius, type Grid, type VisibilityFan } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameController } from '../runtime/controller';
import { useSettings } from '../runtime/settings';
import { useGameUi } from '../runtime/store';

/** Cone colours; the colour-blind palette uses Okabe-Ito hues (alerted cones are striped in both). */
const CONE_COLORS = {
  standard: { calm: '#5fd17a', wary: '#f0a23a', alert: '#ff5a3c' },
  colorblind: { calm: '#56b4e9', wary: '#e69f00', alert: '#d55e00' },
} as const;

const RAYS = 41;
const MAX_CONES = 26;
const PATH_DOTS = 160;

/** Translucent ground decal material with optional world-space stripes (colour-blind cue for alert). */
function coneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: { uColor: { value: new THREE.Color('#5fd17a') }, uOpacity: { value: 0.22 }, uStripes: { value: 0 } },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uStripes;
      varying vec3 vWorld;
      void main() {
        float band = step(0.5, fract((vWorld.x + vWorld.z) * 0.9));
        float alpha = uOpacity * mix(1.0, 0.35 + 0.65 * band, uStripes);
        gl_FragColor = vec4(uColor, alpha);
      }`,
  });
}

function fanGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RAYS + 1) * 3), 3));
  const index: number[] = [];
  // Ray angles increase clockwise seen from above, so (0, i + 1, i) faces the camera.
  for (let i = 1; i < RAYS; i += 1) index.push(0, i + 1, i);
  g.setIndex(index);
  return g;
}

function writeFan(geometry: THREE.BufferGeometry, grid: Grid, origin: { x: number; z: number }, fan: VisibilityFan, distances: number[]): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const base = grid.heightAt(origin) + 0.09;
  pos.setXYZ(0, origin.x, base, origin.z);
  for (let i = 0; i < RAYS; i += 1) {
    const angle = fan.angles[i] ?? 0;
    const d = distances[i] ?? 0;
    const x = origin.x + Math.cos(angle) * d;
    const z = origin.z + Math.sin(angle) * d;
    pos.setXYZ(i + 1, x, grid.heightAt({ x, z }) + 0.09, z);
  }
  pos.needsUpdate = true;
  geometry.computeBoundingSphere();
}

interface ConeSlot {
  far: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  near: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
}

export function Overlay({ controller }: { controller: GameController }) {
  const root = useRef<THREE.Group>(null);
  const slots = useMemo<ConeSlot[]>(
    () =>
      Array.from({ length: MAX_CONES }, () => ({
        far: Object.assign(new THREE.Mesh(fanGeometry(), coneMaterial()), { name: 'cone-far' }),
        near: Object.assign(new THREE.Mesh(fanGeometry(), coneMaterial()), { name: 'cone-near' }),
      })),
    [],
  );
  const fanCache = useRef(new Map<string, { fan: VisibilityFan; frame: number }>());
  const frameCount = useRef(0);

  const dot = useMemo(() => new THREE.CircleGeometry(0.1, 8).rotateX(-Math.PI / 2), []);
  const dots = useRef<THREE.InstancedMesh>(null);
  const endRing = useRef<THREE.Mesh>(null);
  const blocked = useRef<THREE.Mesh>(null);
  const preview = useRef<{ key: string; points: { x: number; z: number }[]; ok: boolean }>({ key: '', points: [], ok: true });

  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.96, 1, 48).rotateX(-Math.PI / 2), []);
  const noiseRings = useMemo(
    () => Array.from({ length: 24 }, () => new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: '#f2efe6', transparent: true, depthWrite: false }))),
    [ringGeometry],
  );
  const footprint = useMemo(() => new THREE.CircleGeometry(0.11, 6).scale(1.5, 1, 0.8).rotateX(-Math.PI / 2), []);
  const prints = useRef<THREE.InstancedMesh>(null);
  const smokeGeo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
  const smokeMeshes = useMemo(() => Array.from({ length: 18 }, () => new THREE.Mesh(smokeGeo, new THREE.MeshStandardMaterial({ color: '#9aa0a2', transparent: true, opacity: 0.55, depthWrite: false, roughness: 1 }))), [smokeGeo]);
  const beam = useRef<THREE.Mesh>(null);
  const beamGeometry = useMemo(() => new THREE.ConeGeometry(4.5, 46, 28, 8, true).translate(0, -23, 0).rotateX(-Math.PI / 2), []);
  // Soft volumetric look: bright near the lamp, fading along the beam and toward its silhouette.
  const beamMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color('#f4efd6') } },
        vertexShader: `
          varying float vAlong;
          varying vec3 vNormalView;
          varying vec3 vViewDir;
          void main() {
            vAlong = clamp(length(position) / 46.0, 0.0, 1.0);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            // Normalised in the fragment shader: the cone's tip has a zero-length normal, and
            // normalize(0) is NaN, which bloom spreads over the whole screen.
            vNormalView = normalMatrix * normal;
            vViewDir = -mv.xyz;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vAlong;
          varying vec3 vNormalView;
          varying vec3 vViewDir;
          void main() {
            float nLen = length(vNormalView);
            float vLen = length(vViewDir);
            float facing = nLen > 1e-5 && vLen > 1e-5 ? abs(dot(vNormalView / nLen, vViewDir / vLen)) : 0.0;
            // Interpolation can push 1 - vAlong a hair below zero, and pow() of a negative is NaN.
            float alpha = pow(max(1.0 - vAlong, 0.0), 1.6) * smoothstep(0.05, 0.75, facing) * 0.16;
            gl_FragColor = vec4(uColor * alpha, alpha);
          }`,
      }),
    [],
  );
  const markerGeo = useMemo(() => new THREE.OctahedronGeometry(0.32), []);
  const markers = useMemo(() => Array.from({ length: 6 }, () => new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: '#e7c35a' }))), [markerGeo]);
  const extraction = useMemo(() => {
    const zone = controller.level.zones.find((z) => z.id === controller.mission.extractionZoneId && z.kind === 'extraction');
    if (!zone) return null;
    const pts = [zone.min, { x: zone.max.x, z: zone.min.z }, zone.max, { x: zone.min.x, z: zone.max.z }, zone.min].map(
      (p) => new THREE.Vector3(p.x, controller.world.grid.heightAt(p) + 0.12, p.z),
    );
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: '#8fd18a', dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.8 }));
  }, [controller]);

  useFrame((frame) => {
    const world = controller.world;
    const s = world.state;
    const ui = useGameUi.getState();
    frameCount.current += 1;
    const now = performance.now();
    ui.prune(now);

    // ── Vision cones ────────────────────────────────────────────────────────────────────
    const show = new Set<string>(ui.pinnedCones);
    if (ui.hovered?.kind === 'guard') show.add(ui.hovered.id);
    if (ui.showAllCones) {
      const focus = frame.camera.position;
      for (const g of s.guards) {
        if (g.status === 'active' && Math.hypot(g.pos.x - focus.x, g.pos.z - focus.z) < 90) show.add(g.id);
      }
    }
    let used = 0;
    for (const id of show) {
      if (used >= MAX_CONES) break;
      const g = world.guard(id);
      if (!g || g.status !== 'active') continue;
      const cached = fanCache.current.get(id);
      let fan = cached?.fan;
      if (!cached || frameCount.current - cached.frame >= 2) {
        fan = world.fanFor(id, RAYS) ?? undefined;
        if (fan) fanCache.current.set(id, { fan, frame: frameCount.current });
      }
      if (!fan) continue;
      const slot = slots[used]!;
      const origin = controller.interpolate(id, g.pos);
      writeFan(slot.far.geometry, world.grid, origin, fan, fan.far);
      writeFan(slot.near.geometry, world.grid, origin, fan, fan.near);
      const alert = g.state === 'alerted' || g.state === 'combat' || g.state === 'challenge';
      const wary = g.state === 'suspicious' || g.state === 'investigate' || g.state === 'search';
      const colors = CONE_COLORS[useSettings.getState().palette];
      const color = alert ? colors.alert : wary ? colors.wary : colors.calm;
      slot.far.material.uniforms.uColor!.value.set(color);
      slot.near.material.uniforms.uColor!.value.set(color);
      slot.far.material.uniforms.uOpacity!.value = 0.16;
      slot.near.material.uniforms.uOpacity!.value = 0.3;
      slot.far.material.uniforms.uStripes!.value = alert ? 1 : 0;
      slot.near.material.uniforms.uStripes!.value = alert ? 1 : 0;
      slot.far.visible = true;
      slot.near.visible = true;
      used += 1;
    }
    for (let i = used; i < slots.length; i += 1) {
      slots[i]!.far.visible = false;
      slots[i]!.near.visible = false;
    }

    // ── Path preview for the first selected operative ───────────────────────────────────
    const lead = ui.selected[0] ? world.operative(ui.selected[0]) : undefined;
    const ground = ui.groundPoint;
    const showPath = Boolean(lead && lead.status === 'active' && ground && !ui.targeting && (!ui.hovered || ui.hovered.kind === 'operative'));
    if (showPath && lead && ground) {
      const key = `${lead.id}:${Math.round(ground.x * 2)}:${Math.round(ground.z * 2)}:${Math.round(lead.pos.x)}:${Math.round(lead.pos.z)}`;
      if (key !== preview.current.key) {
        const res = world.previewPath(lead.id, ground);
        preview.current = { key, points: res && res.ok ? res.points : [], ok: Boolean(res?.ok) };
      }
    }
    const dotMesh = dots.current;
    if (dotMesh) {
      let n = 0;
      if (showPath && preview.current.ok) {
        const m = new THREE.Matrix4();
        const pts = preview.current.points;
        for (let i = 1; i < pts.length && n < PATH_DOTS; i += 1) {
          const a = pts[i - 1]!;
          const b = pts[i]!;
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          for (let t = 0; t < len && n < PATH_DOTS; t += 0.75) {
            const x = a.x + ((b.x - a.x) * t) / len;
            const z = a.z + ((b.z - a.z) * t) / len;
            m.makeTranslation(x, Math.max(world.grid.heightAt({ x, z }), world.level.seaLevel) + 0.08, z);
            dotMesh.setMatrixAt(n++, m);
          }
        }
      }
      dotMesh.count = n;
      dotMesh.instanceMatrix.needsUpdate = true;
    }
    if (endRing.current) {
      const end = preview.current.points.at(-1);
      endRing.current.visible = showPath && preview.current.ok && Boolean(end);
      if (end) endRing.current.position.set(end.x, world.grid.heightAt(end) + 0.08, end.z);
    }
    if (blocked.current) {
      blocked.current.visible = showPath && !preview.current.ok;
      if (ground) blocked.current.position.set(ground.x, world.grid.heightAt(ground) + 0.1, ground.z);
    }

    // ── Noise rings ─────────────────────────────────────────────────────────────────────
    const showNoise = useSettings.getState().showNoise;
    noiseRings.forEach((mesh, i) => {
      const ring = ui.noiseRings[i];
      if (!ring || !showNoise) {
        mesh.visible = false;
        return;
      }
      const t = Math.min(1, (now - ring.born) / 900);
      const radius = Math.max(0.3, ring.radius * (0.25 + 0.75 * (1 - (1 - t) * (1 - t))));
      mesh.visible = true;
      mesh.scale.set(radius, 1, radius);
      mesh.position.set(ring.pos.x, world.grid.heightAt(ring.pos) + 0.1, ring.pos.z);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(ring.kind === 'loud' ? '#ff6a4a' : ring.kind === 'lure' ? '#f0b44a' : '#f2efe6');
      mat.opacity = (1 - t) * (ring.kind === 'footstep' ? 0.35 : 0.8);
    });

    // ── Footprints ──────────────────────────────────────────────────────────────────────
    const printMesh = prints.current;
    if (printMesh) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const scale = new THREE.Vector3(1, 1, 1);
      const list = s.footprints;
      const count = Math.min(list.length, 600);
      for (let i = 0; i < count; i += 1) {
        const fp = list[list.length - 1 - i]!;
        q.setFromAxisAngle(up, -fp.heading);
        m.compose(new THREE.Vector3(fp.pos.x, world.grid.heightAt(fp.pos) + 0.03, fp.pos.z), q, scale);
        printMesh.setMatrixAt(i, m);
      }
      printMesh.count = count;
      printMesh.instanceMatrix.needsUpdate = true;
    }

    // ── Smoke, searchlight, objective markers ───────────────────────────────────────────
    let puff = 0;
    for (const cloud of s.smoke) {
      for (let k = 0; k < 3 && puff < smokeMeshes.length; k += 1) {
        const mesh = smokeMeshes[puff++]!;
        const life = Math.max(0, (cloud.until - s.tick) / 400);
        mesh.visible = true;
        mesh.scale.setScalar(cloud.radius * (0.55 + 0.15 * k) * (0.6 + 0.4 * Math.min(1, life * 3)));
        mesh.position.set(cloud.pos.x + (k - 1) * 1.2, world.grid.heightAt(cloud.pos) + 1.2 + k * 0.5, cloud.pos.z + (k % 2) * 0.8);
        (mesh.material as THREE.MeshStandardMaterial).opacity = 0.5 * Math.min(1, life * 4);
      }
    }
    for (let i = puff; i < smokeMeshes.length; i += 1) smokeMeshes[i]!.visible = false;

    const light = s.objects.find((o) => o.type === 'searchlight');
    if (beam.current) {
      const on = light && light.type === 'searchlight' && !light.sabotaged && !light.destroyed && s.env.ambientLight < 0.6;
      beam.current.visible = Boolean(on);
      if (on && light.type === 'searchlight') {
        beam.current.position.set(light.pos.x, world.grid.heightAt(light.pos) + 6.6, light.pos.z);
        beam.current.rotation.set(-0.16, -(light.heading ?? 0) + Math.PI / 2, 0, 'YXZ');
      }
    }

    let m = 0;
    for (const def of controller.mission.objectives) {
      const state = s.objectives.find((o) => o.id === def.id);
      if (!state || state.status !== 'active' || m >= markers.length) continue;
      const objId = def.kind === 'disable-target' ? def.targetId : def.kind === 'acquire-item' ? def.itemObjectId : def.kind === 'rescue' ? def.prisonerId : null;
      const obj = objId ? world.object(objId) : undefined;
      if (!obj || (obj.type === 'prisoner' && obj.freed)) continue;
      const mesh = markers[m++]!;
      mesh.visible = true;
      mesh.position.set(obj.pos.x, world.grid.heightAt(obj.pos) + 3.2 + Math.sin(now / 400) * 0.15, obj.pos.z);
      mesh.rotation.y = now / 700;
    }
    for (let i = m; i < markers.length; i += 1) markers[i]!.visible = false;
    if (extraction) (extraction.material as THREE.LineDashedMaterial).color.set(s.objectives.every((o) => o.status !== 'active' || !controller.mission.objectives.find((d) => d.id === o.id)?.required) ? '#8fd18a' : '#7c8a8f');
  });

  return (
    <group ref={root} name="overlay">
      {slots.map((slot, i) => (
        <group key={i}>
          <primitive object={slot.far} renderOrder={1} />
          <primitive object={slot.near} renderOrder={1} />
        </group>
      ))}
      <instancedMesh ref={dots} args={[dot, new THREE.MeshBasicMaterial({ color: '#f2efe6', transparent: true, opacity: 0.85, depthWrite: false }), PATH_DOTS]} renderOrder={3} />
      <mesh ref={endRing} geometry={ringGeometry} scale={[0.45, 1, 0.45]} renderOrder={3}>
        <meshBasicMaterial color="#f2efe6" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={blocked} renderOrder={3} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[0.9, 0.18]} />
        <meshBasicMaterial color="#ff5a3c" transparent opacity={0.95} depthWrite={false} />
      </mesh>
      {noiseRings.map((mesh, i) => (
        <primitive key={i} object={mesh} renderOrder={2} />
      ))}
      <instancedMesh ref={prints} args={[footprint, new THREE.MeshBasicMaterial({ color: '#2a241c', transparent: true, opacity: 0.55, depthWrite: false }), 600]} renderOrder={1} />
      {smokeMeshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
      <mesh ref={beam} geometry={beamGeometry} material={beamMaterial} renderOrder={4} />
      {markers.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
      {extraction && <primitive object={extraction} onUpdate={(line: THREE.Line) => line.computeLineDistances()} />}
    </group>
  );
}

/** Radius of a sound ring as drawn in the overlay: the same formula the AI's hearing uses (open ground). */
export function ringRadius(db: number, floor: number): number {
  return Math.min(45, audibleRadius(db, floor + 3));
}
