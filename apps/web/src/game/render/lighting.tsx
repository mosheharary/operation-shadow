'use client';

import type { LightDef } from '@operation-shadow/engine';
import { useFrame, useThree } from '@react-three/fiber';
import { lazy, Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameController } from '../runtime/controller';
import { cameraFocus } from '../camera/camera-rig';
import { SHADOW_ONLY_LAYER } from './layers';

/** Cascaded shadow maps (three's CSM) only load with the rich environment setting. */
const CascadedSun = lazy(() => import('./cascaded-sun').then((m) => ({ default: m.CascadedSun })));

const LAMP_POOL = 6;
const LANTERN_POOL = 4;

function Rain({ controller, count = 1100 }: { controller: GameController; count?: number }) {
  const lines = useMemo(() => {
    const positions = new Float32Array(count * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#9fb2c4', transparent: true, opacity: 0.32 });
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      seeds[i * 3] = Math.random() * 60 - 30;
      seeds[i * 3 + 1] = Math.random() * 22;
      seeds[i * 3 + 2] = Math.random() * 60 - 30;
    }
    return { object: new THREE.LineSegments(geometry, mat), seeds };
  }, [count]);

  useFrame((frame, dt) => {
    const focus = cameraFocus(frame.camera);
    const pos = lines.object.geometry.attributes.position as THREE.BufferAttribute;
    const { seeds } = lines;
    for (let i = 0; i < count; i += 1) {
      seeds[i * 3 + 1]! -= dt * 16;
      if (seeds[i * 3 + 1]! < 0) seeds[i * 3 + 1] = 22;
      const x = focus.x + seeds[i * 3]!;
      const z = focus.z + seeds[i * 3 + 2]!;
      const y = controller.world.grid.heightAt({ x, z }) + seeds[i * 3 + 1]!;
      pos.setXYZ(i * 2, x, y, z);
      pos.setXYZ(i * 2 + 1, x + 0.05, y - 0.55, z + 0.03);
    }
    pos.needsUpdate = true;
    lines.object.geometry.computeBoundingSphere();
  });
  return <primitive object={lines.object} />;
}

export function Lighting({ controller, shadows = true, cascaded = false }: { controller: GameController; shadows?: boolean; cascaded?: boolean }) {
  // Cascaded shadows replace the single sun shadow (and the sun itself: CSM brings its lights).
  const csm = shadows && cascaded;
  const sun = useRef<THREE.DirectionalLight>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const lampRefs = useRef<(THREE.PointLight | null)[]>([]);
  const lanternRefs = useRef<(THREE.PointLight | null)[]>([]);
  const env = controller.world.state.env;
  const lamps = useMemo(() => controller.level.lights.filter((l): l is LightDef => l.kind === 'lamp'), [controller]);
  const daylight = env.ambientLight;
  const sunColor = useMemo(() => new THREE.Color('#a4bbe0').lerp(new THREE.Color('#fff1d8'), Math.min(1, daylight * 1.4)), [daylight]);

  const fogColor = useMemo(() => new THREE.Color('#1b2632').lerp(new THREE.Color('#a9b6bf'), daylight), [daylight]);
  const background = useMemo(() => fogColor.clone().multiplyScalar(0.8), [fogColor]);
  // Light enough to read as sea mist from the tactical camera rather than as darkness.
  const fogDensity = env.weather === 'fog' ? 0.0105 : env.weather === 'rain' ? 0.0075 : env.weather === 'snow' ? 0.006 : 0.005;

  const scene = useThree((s) => s.scene);
  useFrame((frame) => {
    const focus = cameraFocus(frame.camera);
    // Mist is tuned for the play distance: thin it as the camera pulls back so a zoomed-out view
    // still shows the map instead of a wall of fog.
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = fogDensity * THREE.MathUtils.clamp(48 / frame.camera.position.distanceTo(focus), 0.15, 1);
    if (sun.current) {
      sun.current.position.set(focus.x + 30, 55, focus.z - 34);
      sun.current.target.position.set(focus.x, 0, focus.z);
      sun.current.target.updateMatrixWorld();
    }
    const nearestLamps = [...lamps].sort((a, b) => Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) - Math.hypot(b.pos.x - focus.x, b.pos.z - focus.z)).slice(0, LAMP_POOL);
    lampRefs.current.forEach((light, i) => {
      const lamp = nearestLamps[i];
      if (!light) return;
      light.visible = Boolean(lamp) && daylight < 0.6;
      if (lamp) light.position.set(lamp.pos.x, controller.world.grid.heightAt(lamp.pos) + lamp.height - 0.2, lamp.pos.z);
    });
    const lanterns = controller.world.state.guards
      .filter((g) => g.carriesLantern && g.status === 'active')
      .sort((a, b) => Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) - Math.hypot(b.pos.x - focus.x, b.pos.z - focus.z))
      .slice(0, LANTERN_POOL);
    lanternRefs.current.forEach((light, i) => {
      const g = lanterns[i];
      if (!light) return;
      light.visible = Boolean(g) && daylight < 0.6;
      if (g) {
        const p = controller.interpolate(g.id, g.pos);
        light.position.set(p.x, controller.world.grid.heightAt(p) + 0.9 + g.eyeElevation, p.z);
      }
    });
    const searchlight = controller.world.state.objects.find((o) => o.type === 'searchlight');
    if (spot.current && searchlight?.type === 'searchlight') {
      const on = !searchlight.sabotaged && !searchlight.destroyed && daylight < 0.6;
      spot.current.visible = on;
      const h = controller.world.grid.heightAt(searchlight.pos) + 6.6;
      spot.current.position.set(searchlight.pos.x, h, searchlight.pos.z);
      const heading = searchlight.heading ?? 0;
      spot.current.target.position.set(searchlight.pos.x + Math.cos(heading) * 40, h - 7, searchlight.pos.z + Math.sin(heading) * 40);
      spot.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <fogExp2 attach="fog" args={[fogColor, fogDensity]} />
      <color attach="background" args={[background.r, background.g, background.b]} />
      {/* Moonlit night: a cool blue sky fill keeps the diorama readable, warm lamps do the rest. */}
      <hemisphereLight args={['#7d93b8', '#2b2a24', 1.45 + daylight * 0.4]} />
      <ambientLight color="#9fb2cc" intensity={0.32 + daylight * 0.2} />
      {/* CSM's shader expects its cascade lights to be the only directional lights. */}
      {!csm && (
        <directionalLight
          ref={(light) => {
            sun.current = light;
            // Shadow proxies (low-detail stand-ins) are drawn by the shadow camera only.
            light?.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
          }}
          castShadow={shadows}
          color={sunColor}
          intensity={2.5 + daylight * 1.2}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-46}
          shadow-camera-right={46}
          shadow-camera-top={46}
          shadow-camera-bottom={-46}
          shadow-camera-near={1}
          shadow-camera-far={160}
          shadow-bias={-0.0006}
          shadow-normalBias={0.03}
        />
      )}
      {Array.from({ length: LAMP_POOL }, (_, i) => (
        <pointLight
          key={`lamp-${i}`}
          ref={(l) => {
            lampRefs.current[i] = l;
          }}
          color="#ffc884"
          intensity={14}
          distance={13}
          decay={1.8}
        />
      ))}
      {Array.from({ length: LANTERN_POOL }, (_, i) => (
        <pointLight
          key={`lantern-${i}`}
          ref={(l) => {
            lanternRefs.current[i] = l;
          }}
          color="#ffb95e"
          intensity={6}
          distance={8}
          decay={1.8}
        />
      ))}
      <spotLight ref={spot} color="#f5f2dc" intensity={160} distance={60} angle={0.16} penumbra={0.35} decay={1.4} />
      {csm && (
        <Suspense fallback={null}>
          <CascadedSun color={sunColor} intensity={2.5 + daylight * 1.2} />
        </Suspense>
      )}
      {env.weather === 'rain' && <Rain controller={controller} />}
    </>
  );
}
