'use client';

import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { TICK_RATE, type World } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { GameController } from '../runtime/controller';
import { type Forecast, forecast, type ForesightIncidentKind, FORESIGHT_SAMPLE_TICKS, foresightClock, trackAt, verdict } from '../runtime/foresight';
import { useSettings } from '../runtime/settings';
import { useGameUi } from '../runtime/store';
import { CONE_COLORS } from './overlay';

const MAX_TRACKS = 40;
const MAX_DOTS = 1800;
const MAX_INCIDENTS = 8;
/** The forecast plays back this many times faster than real time... */
const PLAYBACK_RATE = 3;
/** ...then holds on the end for a moment before it starts again. */
const HOLD_SECONDS = 0.9;
const GUARD_COLOR = '#bcd6ff';
const RINGED = new Set<ForesightIncidentKind>(['spotted', 'noticed', 'body-found', 'casualty']);

/** Rings in the view-cone colours, so the colour-blind palette applies to them too. */
function incidentColor(kind: ForesightIncidentKind, palette: 'standard' | 'colorblind'): string {
  if (kind === 'objective') return '#e7c35a';
  return kind === 'noticed' || kind === 'body-found' || kind === 'unrest' ? CONE_COLORS[palette].wary : CONE_COLORS[palette].alert;
}

/** Translucent figure standing where a unit will be: brightest at the top, fading into the ground. */
function ghostMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(GUARD_COLOR) }, uOpacity: { value: 0.7 } },
    vertexShader: `
      varying float vHeight;
      varying vec3 vNormalView;
      void main() {
        vHeight = position.y;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vHeight;
      varying vec3 vNormalView;
      void main() {
        // A hologram's rim: the silhouette glows, the middle stays see-through.
        float rim = 1.0 - abs(vNormalView.z);
        float alpha = (0.35 + 0.65 * rim * rim) * smoothstep(0.0, 1.1, vHeight) * uOpacity;
        alpha *= 0.75 + 0.25 * step(0.5, fract(vHeight * 9.0));
        gl_FragColor = vec4(uColor * alpha * 1.3, alpha);
      }`,
  });
}

interface GhostSlot {
  body: THREE.Mesh<THREE.CapsuleGeometry, THREE.ShaderMaterial>;
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

interface IncidentSlot {
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  thread: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
}

/** When foresight is shown: in tactical pause, mid-mission, with nothing else on screen. */
function shouldShow(controller: GameController): boolean {
  const ui = useGameUi.getState();
  return (
    useSettings.getState().showForesight &&
    controller.paused &&
    !controller.held &&
    controller.world.state.status === 'running' &&
    !ui.cinematic &&
    !ui.recall &&
    ui.menu === 'none'
  );
}

/**
 * Foresight in tactical pause: the next ten seconds play out as ghosts. Every patrol and every
 * squad member with an order leaves a dotted track of where they will walk (sentries pale blue,
 * the squad in their own colours), a ghost glides along it on a short loop, and trouble on the way
 * is ringed where it happens (amber when a sentry starts sizing someone up, red at the sighting,
 * with a thread from the sentry). The forecast is recomputed whenever an order changes the plan.
 */
export function Foresight({ controller }: { controller: GameController }) {
  const dotGeometry = useMemo(() => new THREE.CircleGeometry(0.09, 8).rotateX(-Math.PI / 2), []);
  const dots = useMemo(() => {
    const mesh = new THREE.InstancedMesh(
      dotGeometry,
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }),
      MAX_DOTS,
    );
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOTS * 3), 3);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = 'foresight-dots';
    return mesh;
  }, [dotGeometry]);
  const ghostGeometry = useMemo(() => new THREE.CapsuleGeometry(0.32, 1, 4, 14).translate(0, 0.82, 0), []);
  const haloGeometry = useMemo(() => new THREE.RingGeometry(0.4, 0.62, 32).rotateX(-Math.PI / 2).translate(0, 0.07, 0), []);
  const ghosts = useMemo<GhostSlot[]>(
    () =>
      Array.from({ length: MAX_TRACKS }, () => {
        const body = Object.assign(new THREE.Mesh(ghostGeometry, ghostMaterial()), { name: 'foresight-ghost', visible: false, renderOrder: 4 });
        // A halo on the ground under the figure: from the usual high camera it is the part that reads.
        const halo = new THREE.Mesh(haloGeometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        body.add(halo);
        return { body, halo };
      }),
    [ghostGeometry, haloGeometry],
  );
  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.75, 0.95, 40).rotateX(-Math.PI / 2), []);
  const incidents = useMemo<IncidentSlot[]>(
    () =>
      Array.from({ length: MAX_INCIDENTS }, () => {
        const thread = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          new THREE.LineDashedMaterial({ dashSize: 0.35, gapSize: 0.2, transparent: true, depthTest: false }),
        );
        thread.renderOrder = 6;
        thread.visible = false;
        const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
        ring.name = 'foresight-incident';
        ring.renderOrder = 6;
        ring.visible = false;
        return { ring, thread };
      }),
    [ringGeometry],
  );

  const state = useMemo(() => ({ key: '', world: null as World | null, forecast: null as Forecast | null, shownAt: 0 }), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);

  useEffect(
    () => () => {
      useGameUi.getState().setForesight(null);
      foresightClock.t = null;
    },
    [],
  );

  const hide = () => {
    dots.visible = false;
    for (const ghost of ghosts) ghost.body.visible = false;
    for (const slot of incidents) {
      slot.ring.visible = false;
      slot.thread.visible = false;
    }
  };

  /** Rebuilds the dotted tracks for a fresh forecast; brightness is set per frame. */
  const layDots = (world: World, f: Forecast) => {
    let n = 0;
    for (const track of f.tracks) {
      if (!track.moves) continue;
      for (let i = 1; i < track.points.length && n < MAX_DOTS; i += 1) {
        const p = track.points[i]!;
        // Every whole second is marked a little larger, so the track reads as a timeline.
        const second = (i * FORESIGHT_SAMPLE_TICKS) % TICK_RATE === 0;
        position.set(p.x, world.grid.heightAt(p) + 0.06, p.z);
        scale.setScalar(second ? 1.7 : 1);
        matrix.compose(position, quaternion, scale);
        dots.setMatrixAt(n, matrix);
        n += 1;
      }
    }
    dots.count = n;
    dots.instanceMatrix.needsUpdate = true;
  };

  useFrame((frame) => {
    const world = controller.world;
    if (!shouldShow(controller)) {
      if (state.forecast) {
        state.forecast = null;
        state.key = '';
        state.world = null;
        hide();
        foresightClock.t = null;
        useGameUi.getState().setForesight(null);
      }
      return;
    }

    // A new forecast whenever the plan changes: an order given, a load or a wind-back.
    const key = `${world.state.tick}:${world.pendingCommands().length}:${world.state.nextId}`;
    if (key !== state.key || !state.forecast || world !== state.world) {
      state.key = key;
      state.world = world;
      const f = forecast(world);
      state.forecast = f;
      state.shownAt = frame.clock.elapsedTime;
      layDots(world, f);
      const v = verdict(f);
      useGameUi.getState().setForesight({
        tone: v.tone,
        text: v.text,
        seconds: f.seconds,
        // The soonest few, and always the sighting the forecast stops at.
        incidents: (f.incidents.length > 4 ? [...f.incidents.slice(0, 3), f.incidents.at(-1)!] : f.incidents).map((i) => ({ seconds: i.seconds, kind: i.kind, text: i.text })),
      });
    }
    const f = state.forecast;

    // The playhead: the forecast plays at three times real time, then holds and loops.
    const loop = f.seconds / PLAYBACK_RATE + HOLD_SECONDS;
    const elapsed = frame.clock.elapsedTime - state.shownAt;
    // Under reduced motion the ghosts stand still where the forecast ends.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const t = still ? f.seconds : Math.min(f.seconds, (elapsed % loop) * PLAYBACK_RATE);
    foresightClock.t = t;
    const palette = useSettings.getState().palette;

    // Dots light up once the playhead has passed them, and fade the further ahead they lie.
    let n = 0;
    for (const track of f.tracks) {
      if (!track.moves) continue;
      color.set(track.role ? SPECIALIST_PROFILES[track.role].color : GUARD_COLOR);
      for (let i = 1; i < track.points.length && n < dots.count; i += 1) {
        const at = (i * FORESIGHT_SAMPLE_TICKS) / TICK_RATE;
        const ahead = 1 - (at / Math.max(1, f.seconds)) * 0.6;
        const lit = at <= t ? 1 : 0.35;
        dots.setColorAt(n, tint.copy(color).multiplyScalar(ahead * lit));
        n += 1;
      }
    }
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
    dots.visible = true;

    let g = 0;
    for (const track of f.tracks) {
      if (!track.moves || g >= ghosts.length) continue;
      const { body, halo } = ghosts[g++]!;
      const p = trackAt(track, t);
      body.position.set(p.x, world.grid.heightAt(p), p.z);
      const hue = track.role ? SPECIALIST_PROFILES[track.role].color : GUARD_COLOR;
      // A ghost on the hold at the end fades out, so the loop's restart reads as a rewind.
      const opacity = t >= f.seconds && !still ? Math.max(0, 1 - ((elapsed % loop) - f.seconds / PLAYBACK_RATE) / HOLD_SECONDS) : 1;
      const u = body.material.uniforms;
      u.uColor!.value.set(hue);
      u.uOpacity!.value = opacity * 0.85;
      halo.material.color.set(hue).multiplyScalar(opacity * 0.9);
      body.visible = true;
    }
    for (let i = g; i < ghosts.length; i += 1) ghosts[i]!.body.visible = false;

    // Trouble appears where it happens once the playhead reaches it, and pulses.
    let k = 0;
    const time = frame.clock.elapsedTime;
    for (const incident of f.incidents) {
      if (k >= incidents.length) break;
      // The alarm and objectives have no one place to ring; the panel names them.
      if (!RINGED.has(incident.kind)) continue;
      const slot = incidents[k++]!;
      const shown = incident.seconds <= t + 1e-6;
      slot.ring.visible = shown;
      slot.thread.visible = shown && incident.from !== null;
      if (!shown) continue;
      const c = incidentColor(incident.kind, palette);
      const y = world.grid.heightAt(incident.pos) + 0.08;
      slot.ring.position.set(incident.pos.x, y, incident.pos.z);
      const since = t - incident.seconds;
      const pop = Math.min(1, since * 4);
      slot.ring.scale.setScalar((0.6 + 0.6 * pop) * (incident.kind === 'spotted' ? 1.4 + Math.sin(time * 6) * 0.15 : 1));
      slot.ring.material.color.set(c);
      slot.ring.material.opacity = incident.kind === 'spotted' ? 0.95 : 0.7;
      if (incident.from) {
        const positions = slot.thread.geometry.attributes.position as THREE.BufferAttribute;
        positions.setXYZ(0, incident.from.x, world.grid.heightAt(incident.from) + 1.5, incident.from.z);
        positions.setXYZ(1, incident.pos.x, y + 0.9, incident.pos.z);
        positions.needsUpdate = true;
        slot.thread.computeLineDistances();
        slot.thread.material.color.set(c);
        slot.thread.material.opacity = 0.85;
      }
    }
    for (let i = k; i < incidents.length; i += 1) {
      incidents[i]!.ring.visible = false;
      incidents[i]!.thread.visible = false;
    }
  });

  return (
    <group name="foresight">
      <primitive object={dots} />
      {ghosts.map((ghost, i) => (
        <primitive key={i} object={ghost.body} />
      ))}
      {incidents.map((slot, i) => (
        <group key={i}>
          <primitive object={slot.ring} />
          <primitive object={slot.thread} />
        </group>
      ))}
    </group>
  );
}
