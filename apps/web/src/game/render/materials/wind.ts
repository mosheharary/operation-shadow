import * as THREE from 'three';

/** Shared clock for every swaying material (advanced once per frame by `advanceWind`). */
const uWindTime = { value: 0 };

export function advanceWind(dt: number): void {
  uWindTime.value += dt;
}

// Sway grows with the square of the height above the model's base; each instance gets its own
// phase from its world position, so a stand of trees never moves in lockstep.
const SWAY = /* glsl */ `
  #include <begin_vertex>
  {
    vec3 windOrigin = vec3(0.0);
    #ifdef USE_INSTANCING
      windOrigin = instanceMatrix[3].xyz;
    #endif
    float windPhase = dot(windOrigin.xz, vec2(0.37, 0.61));
    float windH = max(transformed.y, 0.0);
    float windBend = windH * windH * uWindStrength;
    float windGust = sin(uWindTime * 1.3 + windPhase) * 0.7 + sin(uWindTime * 2.9 + windPhase * 1.7) * 0.3;
    transformed.x += windBend * windGust;
    transformed.z += windBend * 0.6 * sin(uWindTime * 1.7 + windPhase * 0.8);
  }
`;

function patch(shader: THREE.WebGLProgramParametersWithUniforms, strength: number): void {
  shader.uniforms.uWindTime = uWindTime;
  shader.uniforms.uWindStrength = { value: strength };
  shader.vertexShader = `uniform float uWindTime;\nuniform float uWindStrength;\n${shader.vertexShader.replace('#include <begin_vertex>', SWAY)}`;
}

/**
 * A copy of `material` whose vertices sway in the wind, plus the matching depth material so the
 * shadow sways with it. `strength` is the bend (metres) per square metre of height.
 */
export function windMaterial<T extends THREE.Material>(material: T, strength = 0.004): { material: T; depth: THREE.MeshDepthMaterial } {
  const copy = material.clone() as T;
  // Keep the source's own shader changes (surface materials patch theirs), then add the sway.
  copy.onBeforeCompile = (shader, renderer) => {
    material.onBeforeCompile(shader, renderer);
    patch(shader, strength);
  };
  copy.customProgramCacheKey = () => `${material.customProgramCacheKey()}-wind-${strength}`;
  const source = material as unknown as { alphaTest?: number; map?: THREE.Texture | null; side?: THREE.Side };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: source.alphaTest ?? 0, map: source.alphaTest ? (source.map ?? null) : null, side: source.side });
  depth.onBeforeCompile = (shader) => patch(shader, strength);
  depth.customProgramCacheKey = () => `wind-depth-${strength}`;
  return { material: copy, depth };
}
