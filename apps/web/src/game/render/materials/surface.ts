import * as THREE from 'three';
import { highResTextures, type SurfaceKey, surfaceTexture } from './textures';

/** Cheap value noise and triplanar helpers shared by the custom surface shaders. */
export const NOISE_GLSL = /* glsl */ `
  float osHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float osNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(osHash(i), osHash(i + vec2(1.0, 0.0)), f.x), mix(osHash(i + vec2(0.0, 1.0)), osHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  vec3 osTriWeights(vec3 n) {
    vec3 w = pow(abs(n), vec3(4.0));
    return w / (w.x + w.y + w.z);
  }
`;

export interface SurfaceOptions {
  /** Metres covered by one texture tile. */
  scale?: number;
  tint?: THREE.ColorRepresentation;
  /** Multiplies the texture roughness (rain makes surfaces glossier). */
  roughness?: number;
  normalStrength?: number;
  /** 0..1: moss on upward faces, broken up by noise. */
  moss?: number;
  /** 0..1: large-scale brightness variation that hides tiling. */
  macro?: number;
  /** 'uv' samples the mesh UVs (in metres) instead of projecting in world space. */
  projection?: 'triplanar' | 'uv';
  side?: THREE.Side;
  /** Multiply by the geometry's `color` attribute (per-plank or per-stone variation). */
  vertexColors?: boolean;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Standard PBR material with world-space texturing, so procedural geometry needs no UV work.
 * Triplanar projection uses whiteout normal blending; instanced meshes are supported.
 */
export function surfaceMaterial(key: SurfaceKey, options: SurfaceOptions = {}): THREE.MeshStandardMaterial {
  const id = `${key}|${highResTextures() ? 'hi' : 'lo'}|${JSON.stringify(options)}`;
  const cached = cache.get(id);
  if (cached) return cached;
  const { scale = 2, tint = '#ffffff', roughness = 1, normalStrength = 1, moss = 0, macro = 0.35, projection = 'triplanar' } = options;
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    metalness: options.metalness ?? 0,
    side: options.side ?? THREE.FrontSide,
    vertexColors: options.vertexColors ?? false,
    ...(options.emissive ? { emissive: new THREE.Color(options.emissive), emissiveIntensity: options.emissiveIntensity ?? 1 } : {}),
  });
  const uniforms = {
    tpColor: { value: surfaceTexture(key, 'color') },
    tpNormal: { value: surfaceTexture(key, 'normal') },
    tpRough: { value: surfaceTexture(key, 'rough') },
    tpMossColor: { value: surfaceTexture('grass', 'color') },
    tpScale: { value: scale },
    tpTint: { value: new THREE.Color(tint) },
    tpRoughMul: { value: roughness },
    tpNormalStrength: { value: normalStrength },
    tpMoss: { value: moss },
    tpMacro: { value: macro },
  };
  const uvMode = projection === 'uv';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (uvMode) shader.defines = { ...shader.defines, OS_UV_PROJECTION: '' };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNormal;\nvarying vec2 vTpUv;\nattribute vec2 uvMetres;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 tpWorld = vec4(transformed, 1.0);
        vec3 tpObjNormal = objectNormal;
        #ifdef USE_INSTANCING
          tpWorld = instanceMatrix * tpWorld;
          tpObjNormal = mat3(instanceMatrix) * tpObjNormal;
        #endif
        tpWorld = modelMatrix * tpWorld;
        vTpPos = tpWorld.xyz;
        vTpNormal = normalize(mat3(modelMatrix) * tpObjNormal);
        #ifdef OS_UV_PROJECTION
          vTpUv = uvMetres;
        #else
          vTpUv = vec2(0.0);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tpColor;
        uniform sampler2D tpNormal;
        uniform sampler2D tpRough;
        uniform sampler2D tpMossColor;
        uniform float tpScale;
        uniform vec3 tpTint;
        uniform float tpRoughMul;
        uniform float tpNormalStrength;
        uniform float tpMoss;
        uniform float tpMacro;
        varying vec3 vTpPos;
        varying vec3 vTpNormal;
        varying vec2 vTpUv;
        ${NOISE_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 tpN = normalize(vTpNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 tpW = osTriWeights(tpN);
        vec3 tpSign = vec3(tpN.x < 0.0 ? -1.0 : 1.0, tpN.y < 0.0 ? -1.0 : 1.0, tpN.z < 0.0 ? -1.0 : 1.0);
        vec2 tpUvX = vTpPos.zy / tpScale;
        vec2 tpUvY = vTpPos.xz / tpScale;
        vec2 tpUvZ = vTpPos.xy / tpScale;
        tpUvX.x *= tpSign.x;
        tpUvY.x *= tpSign.y;
        tpUvZ.x *= -tpSign.z;
        #ifdef OS_UV_PROJECTION
          vec2 tpUv = vTpUv / tpScale;
          vec4 tpC = texture2D(tpColor, tpUv);
        #else
          vec4 tpC = texture2D(tpColor, tpUvX) * tpW.x + texture2D(tpColor, tpUvY) * tpW.y + texture2D(tpColor, tpUvZ) * tpW.z;
        #endif
        float tpVar = osNoise(vTpPos.xz * 0.11 + vTpPos.y * 0.07) * 0.6 + osNoise(vTpPos.xz * 0.53) * 0.4;
        tpC.rgb *= mix(1.0, 0.72 + 0.56 * tpVar, tpMacro);
        float tpMossMask = 0.0;
        if (tpMoss > 0.0) {
          float mossNoise = osNoise(vTpPos.xz * 0.37 + 3.1) * 0.7 + osNoise(vTpPos.xz * 1.9) * 0.3;
          tpMossMask = smoothstep(0.35, 0.8, tpN.y) * smoothstep(0.38, 0.62, mossNoise) * tpMoss;
          tpC.rgb = mix(tpC.rgb, texture2D(tpMossColor, vTpPos.xz / 1.7).rgb * vec3(0.8, 0.95, 0.7), tpMossMask);
        }
        diffuseColor.rgb *= tpC.rgb * tpTint;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#ifdef OS_UV_PROJECTION
          float tpR = texture2D(tpRough, tpUv).r;
        #else
          float tpR = texture2D(tpRough, tpUvX).r * tpW.x + texture2D(tpRough, tpUvY).r * tpW.y + texture2D(tpRough, tpUvZ).r * tpW.z;
        #endif
        float roughnessFactor = clamp(mix(tpR, 0.95, tpMossMask) * tpRoughMul * roughness, 0.04, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
          #ifdef OS_UV_PROJECTION
            // UV-mapped slabs: perturb around the geometric normal with an approximate tangent frame.
            vec3 nT = texture2D(tpNormal, tpUv).xyz * 2.0 - 1.0;
            nT.xy *= tpNormalStrength;
            vec3 up = abs(tpN.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
            vec3 t = normalize(cross(up, tpN));
            vec3 b = cross(tpN, t);
            vec3 tpWorldN = normalize(t * nT.x + b * nT.y + tpN * nT.z);
          #else
            vec3 nX = texture2D(tpNormal, tpUvX).xyz * 2.0 - 1.0;
            vec3 nY = texture2D(tpNormal, tpUvY).xyz * 2.0 - 1.0;
            vec3 nZ = texture2D(tpNormal, tpUvZ).xyz * 2.0 - 1.0;
            nX.xy *= tpNormalStrength;
            nY.xy *= tpNormalStrength;
            nZ.xy *= tpNormalStrength;
            nX.x *= tpSign.x;
            nY.x *= tpSign.y;
            nZ.x *= -tpSign.z;
            nX = vec3(nX.xy + tpN.zy, abs(nX.z) * tpN.x);
            nY = vec3(nY.xy + tpN.xz, abs(nY.z) * tpN.y);
            nZ = vec3(nZ.xy + tpN.xy, abs(nZ.z) * tpN.z);
            vec3 tpWorldN = normalize(nX.zyx * tpW.x + nY.xzy * tpW.y + nZ.xyz * tpW.z);
          #endif
          tpWorldN = normalize(mix(tpWorldN, tpN, tpMossMask * 0.6));
          normal = normalize((viewMatrix * vec4(tpWorldN, 0.0)).xyz);
        }`,
      );
  };
  material.customProgramCacheKey = () => `surface-${uvMode ? 'uv' : 'tri'}`;
  cache.set(id, material);
  return material;
}

/** Adds `uvMetres` (texture coordinates in metres) to a box-like geometry from its face sizes. */
export function withMetreUvs(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Project on the dominant axis of the face, in local metres.
    if (ny >= nx && ny >= Math.abs(normal.getZ(i))) uv.set([x, z], i * 2);
    else if (nx >= Math.abs(normal.getZ(i))) uv.set([z, y], i * 2);
    else uv.set([x, y], i * 2);
  }
  geometry.setAttribute('uvMetres', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
