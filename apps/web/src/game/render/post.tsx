'use client';

import { Bloom, EffectComposer, N8AO, Noise, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { Grade } from './grade';

/** Night keeps colour low and the moonlit split strong; daylight is fuller and nearly neutral. */
const GRADES = {
  night: { contrast: 1.16, saturation: 0.92, toneStrength: 0.3 },
  dusk: { contrast: 1.12, saturation: 1.02, toneStrength: 0.22 },
  day: { contrast: 1.08, saturation: 1.06, toneStrength: 0.1 },
} as const;

/**
 * The "miniature diorama" finish from the approved concept art: ambient occlusion grounds every
 * prop, bloom makes lamps and windows glow, a gentle tilt-shift softens the screen edges like a
 * macro lens, and a vignette frames the table. AgX tone mapping keeps lamp highlights from
 * clipping to flat yellow; the grade then restores contrast and splits moonlit shadows from warm
 * lamplight, and a faint film grain hides banding in the dark gradients. High quality tier only.
 */
export function PostEffects({ sky = 'day' }: { sky?: keyof typeof GRADES }) {
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <N8AO aoRadius={1.6} distanceFalloff={0.6} intensity={2.6} quality="medium" halfRes color="#05080b" />
      <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.25} intensity={0.85} radius={0.7} />
      <TiltShift2 blur={0.09} taper={0.6} start={[0.5, 0.0]} end={[0.5, 1.0]} samples={8} />
      <Vignette offset={0.28} darkness={0.72} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Grade {...GRADES[sky]} />
      <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.035} />
    </EffectComposer>
  );
}
