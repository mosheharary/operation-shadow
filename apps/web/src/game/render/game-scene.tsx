'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useCallback } from 'react';
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
import { Harbor } from './harbor';
import { Lighting } from './lighting';
import { WorldObjects } from './objects';
import { Overlay } from './overlay';
import { PostEffects } from './post';
import { Props } from './props';
import { Rocks } from './rocks';
import { Structures } from './structures';
import { TargetingPreview } from './targeting';
import { Terrain } from './terrain';
import { TestHooks } from './test-hooks';
import { PerfProbe, type RenderSample } from './test-range/perf-probe';
import { Units } from './units';
import { Water } from './water';

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
  const quality = useSettings((s) => s.quality);
  const edgeScroll = useSettings((s) => s.edgeScroll);
  const reducedShake = useSettings((s) => s.reducedShake);
  const high = quality === 'high';
  const weather = controller.world.state.env.weather;
  const wetness = weather === 'rain' ? 1 : weather === 'fog' || weather === 'snow' ? 0.5 : 0.15;

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
      key={quality}
      shadows={high ? 'percentage' : false}
      dpr={high ? [1, 1.5] : [1, 1]}
      flat={high}
      gl={{ antialias: !high, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 32, near: 0.5, far: 650, position: [40, 50, 60] }}
      onCreated={({ gl }) => {
        // With post-processing the ToneMapping effect maps HDR to the screen; otherwise the renderer does.
        if (!high) gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      <SimulationDriver controller={controller} />
      <Lighting controller={controller} shadows={high} />
      <Terrain level={controller.level} wetness={wetness} />
      <Rocks level={controller.level} />
      <Harbor level={controller.level} />
      <Water level={controller.level} />
      <Structures level={controller.level} cutawayRegions={cutawayRegions} />
      <Props level={controller.level} />
      <LampGlows level={controller.level} />
      <WorldObjects controller={controller} />
      <Units controller={controller} />
      <Overlay controller={controller} />
      <TargetingPreview controller={controller} />
      <Effects controller={controller} />
      <CameraRig controller={controller} edgeScroll={edgeScroll} reducedShake={reducedShake} />
      <GameInput controller={controller} />
      {high && <PostEffects />}
      <PerfProbe onSample={onSample} />
      {testHooks && <TestHooks controller={controller} />}
      {audio && <AudioBridge audio={audio} />}
    </Canvas>
  );
}
