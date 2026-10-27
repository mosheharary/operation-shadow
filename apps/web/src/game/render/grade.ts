import { wrapEffect } from '@react-three/postprocessing';
import { BlendFunction, Effect } from 'postprocessing';
import * as THREE from 'three';

/**
 * Film grade applied after tone mapping (linear 0..1): contrast pivots on mid grey so blacks sink
 * and lamps stay bright, saturation is restored after the tone curve flattens it, and a split tone
 * cools the shadows and warms the highlights, the moonlight-and-lamplight look of the concept art.
 */
const FRAGMENT = /* glsl */ `
uniform float contrast;
uniform float saturation;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float toneStrength;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, vec3(0.0));
  // Contrast in log space around linear mid grey (0.18).
  c = pow(c / 0.18 + 1e-5, vec3(contrast)) * 0.18;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  float t = smoothstep(0.02, 0.6, l);
  vec3 tone = mix(shadowTint, highlightTint, t);
  c *= mix(vec3(1.0), tone, toneStrength);
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}
`;

export interface GradeOptions {
  contrast?: number;
  saturation?: number;
  shadowTint?: THREE.ColorRepresentation;
  highlightTint?: THREE.ColorRepresentation;
  toneStrength?: number;
}

const tint = (c: THREE.ColorRepresentation) => {
  const color = new THREE.Color(c);
  // Normalise to unit luminance so the split tone shifts hue without changing brightness.
  const l = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722 || 1;
  return new THREE.Vector3(color.r / l, color.g / l, color.b / l);
};

export class GradeEffect extends Effect {
  constructor({ contrast = 1.12, saturation = 1.12, shadowTint = '#6f8fb8', highlightTint = '#ffd2a0', toneStrength = 0.22 }: GradeOptions = {}) {
    super('GradeEffect', FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['contrast', new THREE.Uniform(contrast)],
        ['saturation', new THREE.Uniform(saturation)],
        ['shadowTint', new THREE.Uniform(tint(shadowTint))],
        ['highlightTint', new THREE.Uniform(tint(highlightTint))],
        ['toneStrength', new THREE.Uniform(toneStrength)],
      ]),
    });
  }
}

export const Grade = wrapEffect(GradeEffect);
