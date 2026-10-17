'use client';

import { Environment } from '@react-three/drei';
import { Suspense } from 'react';
import { AssetBoundary } from '../assets/boundary';

/** Which sky lights the scene at an hour of the day. */
export function skyFor(hour: number): 'night' | 'dusk' | 'day' {
  if (hour >= 20 || hour < 5) return 'night';
  if (hour < 8 || hour >= 18) return 'dusk';
  return 'day';
}

/**
 * The relative strength of each sky's light. The HDRIs are physically scaled (a night sky is
 * thousands of times dimmer than an overcast noon), and the scene keeps its own moon and fill
 * lights, so each sky is brought to a level that adds soft bounce light and reflections without
 * washing out the night.
 */
const INTENSITY = { night: 1.6, dusk: 0.45, day: 0.3 } as const;

/**
 * Image-based lighting from a Poly Haven sky (rich environment setting): soft directional fill,
 * and reflections in the water, wet stone, metal and glass. The background stays the fog colour.
 */
export function SkyLight({ hour, weather }: { hour: number; weather: string }) {
  const sky = skyFor(hour);
  const dim = weather === 'fog' ? 0.6 : weather === 'rain' ? 0.75 : 1;
  return (
    <AssetBoundary id={`sky.${sky}`} fallback={null}>
      <Suspense fallback={null}>
        <Environment files={`/media/hdri/${sky}.hdr`} environmentIntensity={INTENSITY[sky] * dim} />
      </Suspense>
    </AssetBoundary>
  );
}
