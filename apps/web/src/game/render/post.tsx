'use client';

import { Bloom, EffectComposer, N8AO, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

/**
 * The "miniature diorama" finish from the approved concept art: ambient occlusion grounds every
 * prop, bloom makes lamps and windows glow, a gentle tilt-shift softens the screen edges like a
 * macro lens, and a vignette frames the table. High quality tier only.
 */
export function PostEffects() {
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <N8AO aoRadius={1.6} distanceFalloff={0.6} intensity={2.6} quality="medium" halfRes color="#05080b" />
      <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.25} intensity={0.85} radius={0.7} />
      <TiltShift2 blur={0.09} taper={0.6} start={[0.5, 0.0]} end={[0.5, 1.0]} samples={8} />
      <Vignette offset={0.28} darkness={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
