'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { lazy, Suspense, useCallback } from 'react';
import * as THREE from 'three';
import { AudioBridge } from '../audio/audio-bridge';
import type { AudioEngine } from '../audio/audio-engine';
import { CameraRig } from '../camera/camera-rig';
import { GameInput } from '../input/game-input';
import type { GameController } from '../runtime/controller';
import { useSettings } from '../runtime/settings';
import { useGameUi } from '../runtime/store';
import { Effects } from './effects';
import { LampGlows } from './glows';
import { setHighResTextures } from './materials/textures';
import { Grass } from './grass';
import { Harbor } from './harbor';
import { Lighting } from './lighting';
import { WorldObjects } from './objects';
import { Overlay } from './overlay';
import { PostEffects } from './post';
import { Props } from './props';
import { Rocks } from './rocks';
import { Structures } from './structures';
import { TargetingPreview, TutorialMarker } from './targeting';
import { Terrain } from './terrain';
import { TestHooks } from './test-hooks';
import { PerfProbe, type RenderSample } from './test-range/perf-probe';
import { Units } from './units';
import { Water } from './water';

/** Image-based sky lighting (HDR loader) only loads with the rich environment setting. */
const SkyLight = lazy(() => import('./environment').then((m) => ({ default: m.SkyLight })));

/** Drives the fixed-step simulation from the render loop; runs before every other frame callback. */
function SimulationDriver({ controller }: { controller: GameController }) {
  useFrame((_, dt) => controller.advance(dt), -1);
  return null;
}

export interface GameSceneProps {
  controller: GameController;
  onSample?: (sample: RenderSample) => void;
  /** Exposes the read-only window.__OS_GAME__ probe used by browser tests. */
  testHooks?: boolean;
  audio?: AudioEngine | null;
}

const ignoreSample = () => {};

export function GameScene({ controller, onSample = ignoreSample, testHooks = false, audio = null }: GameSceneProps) {
  const shadows = useSettings((s) => s.shadows);
  const post = useSettings((s) => s.postEffects);
  const resolutionScale = useSettings((s) => s.resolutionScale);
  const edgeScroll = useSettings((s) => s.edgeScroll);
  const reducedShake = useSettings((s) => s.reducedShake);
  const rich = useSettings((s) => s.environment === 'rich');
  // Before any material is built: the rich environment uses 1024 px colour maps.
  setHighResTextures(rich);
  const weather = controller.world.state.env.weather;
  const wetness = weather === 'rain' ? 1 : weather === 'fog' || weather === 'snow' ? 0.5 : 0.15;
  const hour = controller.world.state.env.timeOfDay;
  const night = hour >= 20 || hour < 5;
  const glint = (night ? 1 : hour < 8 || hour >= 18 ? 0.35 : 0.2) * (weather === 'fog' ? 0.5 : weather === 'rain' ? 0.7 : 1);

  // Roofs lift off buildings that hold a squad member or sit under the cursor.
  const cutawayRegions = useCallback(() => {
    const regions = new Set<number>();
    const { grid, level, state } = controller.world;
    for (const op of state.operatives) {
      if (op.status === 'extracted') continue;
      const region = level.region[grid.cellAt(op.pos)];
      if (region) regions.add(region);
    }
    const ground = useGameUi.getState().groundPoint;
    if (ground) {
      const region = level.region[grid.cellAt(ground)];
      if (region) regions.add(region);
    }
    return regions;
  }, [controller]);

  return (
    <Canvas
      key={`${shadows}-${post}-${rich}`}
      shadows={shadows ? 'percentage' : false}
      dpr={[Math.min(1, resolutionScale), resolutionScale]}
      flat={post}
      gl={{ antialias: !post, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 32, near: 0.5, far: 650, position: [40, 50, 60] }}
      onCreated={({ gl }) => {
        // With post-processing the ToneMapping effect maps HDR to the screen; otherwise the renderer does.
        if (!post) gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      <SimulationDriver controller={controller} />
      <Lighting controller={controller} shadows={shadows} cascaded={rich} />
      {rich && (
        <Suspense fallback={null}>
          <SkyLight hour={hour} weather={weather} />
        </Suspense>
      )}
      <Terrain level={controller.level} wetness={wetness} detail={rich} />
      <Rocks level={controller.level} />
      <Harbor level={controller.level} />
      <Water level={controller.level} glint={glint} reflections={rich} />
      <Structures level={controller.level} cutawayRegions={cutawayRegions} />
      <Props level={controller.level} />
      {rich && <Grass level={controller.level} />}
      <LampGlows level={controller.level} />
      <WorldObjects controller={controller} />
      <Units controller={controller} />
      <Overlay controller={controller} />
      <TargetingPreview controller={controller} />
      {controller.entry.tutorial && <TutorialMarker controller={controller} />}
      <Effects controller={controller} />
      <CameraRig controller={controller} edgeScroll={edgeScroll} reducedShake={reducedShake} />
      <GameInput controller={controller} />
      {post && <PostEffects />}
      <PerfProbe onSample={onSample} />
      {testHooks && <TestHooks controller={controller} />}
      {audio && <AudioBridge audio={audio} />}
    </Canvas>
  );
}
