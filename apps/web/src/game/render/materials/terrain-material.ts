import * as THREE from 'three';
import { NOISE_GLSL } from './surface';
import { type SurfaceArrays, type SurfaceKey, surfaceArrays } from './textures';

/** Terrain layers, in array order. Rock (index 5) is projected triplanar on steep ground. */
export const TERRAIN_LAYERS: readonly SurfaceKey[] = ['grass', 'sand', 'cobble', 'gravel', 'forest', 'rock', 'concrete', 'planks', 'snow'];
export const ROCK_LAYER = 5;
/** Metres per texture tile for each layer (cobbles slightly enlarged so they read at tactical zoom). */
const LAYER_SCALE = [2.6, 3.2, 2.2, 2.6, 3.2, 4.5, 3.0, 2.6, 3.4];
/** Per-layer colour grade: the grass is lifted toward the concept's moss green. */
const LAYER_TINT = [
  [1.25, 1.45, 0.95],
  [1.05, 1.05, 1.0],
  [1.05, 1.05, 1.08],
  [0.72, 0.72, 0.74],
  [1.1, 1.15, 1.0],
  [1.15, 1.18, 1.15],
  [1.0, 1.0, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 1.02, 1.06],
];

let arrays: SurfaceArrays | null = null;

export interface TerrainMaterialOptions {
  seaLevel: number;
  /** 0..1 rain wetness: darker, glossier ground. */
  wetness: number;
}

/**
 * Splat-blended terrain: eight CC0 surface sets in two array textures, weighted per vertex from
 * the level's surface map, with noise-broken edges, triplanar rock on cliffs, wet shorelines and
 * the baked lamp light the AI uses.
 */
export function createTerrainMaterial(options: TerrainMaterialOptions): THREE.MeshStandardMaterial {
  arrays ??= surfaceArrays(TERRAIN_LAYERS);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  const uniforms = {
    tTerrainColor: { value: arrays.color },
    tTerrainNormal: { value: arrays.normalRough },
    uLayerScale: { value: LAYER_SCALE },
    uLayerTint: { value: LAYER_TINT.map(([r, g, b]) => new THREE.Vector3(r, g, b)) },
    uSea: { value: options.seaLevel },
    uWet: { value: options.wetness },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aLight;
        attribute vec4 splatA;
        attribute vec4 splatB;
        attribute vec4 splatC;
        varying float vLight;
        varying vec4 vSplatA;
        varying vec4 vSplatB;
        varying vec4 vSplatC;
        varying vec3 vTpPos;
        varying vec3 vTpNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLight = aLight;
        vSplatA = splatA;
        vSplatB = splatB;
        vSplatC = splatC;
        vTpPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTpNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray tTerrainColor;
        uniform sampler2DArray tTerrainNormal;
        uniform float uLayerScale[9];
        uniform vec3 uLayerTint[9];
        uniform float uSea;
        uniform float uWet;
        varying float vLight;
        varying vec4 vSplatA;
        varying vec4 vSplatB;
        varying vec4 vSplatC;
        varying vec3 vTpPos;
        varying vec3 vTpNormal;
        ${NOISE_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 tN = normalize(vTpNormal);
        float nA = osNoise(vTpPos.xz * 0.75);
        float nB = osNoise(vTpPos.xz * 3.1);
        float steep = 1.0 - smoothstep(0.6, 0.8, tN.y);
        float rockW = clamp(max(steep, vSplatB.y) + (nA - 0.5) * 0.35 * steep, 0.0, 1.0);
        float w[9];
        w[0] = vSplatA.x; w[1] = vSplatA.y; w[2] = vSplatA.z; w[3] = vSplatA.w;
        w[4] = vSplatB.x; w[5] = 0.0; w[6] = vSplatB.z; w[7] = vSplatB.w; w[8] = vSplatC.x;
        float jitter = (nA * 0.7 + nB * 0.3 - 0.5) * 0.5;
        float total = 0.0;
        for (int i = 0; i < 9; i++) {
          float v = w[i] > 0.001 ? max(0.0, w[i] + jitter) : 0.0;
          v = v * v * v;
          w[i] = v;
          total += v;
        }
        for (int i = 0; i < 9; i++) w[i] = total > 0.0 ? w[i] / total * (1.0 - rockW) : 0.0;
        w[5] = total > 0.0 ? rockW : 1.0;
        vec3 terrainCol = vec3(0.0);
        vec3 terrainN = vec3(0.0);
        float terrainRough = 0.0;
        for (int i = 0; i < 9; i++) {
          if (i == 5 || w[i] < 0.003) continue;
          vec3 uvw = vec3(vTpPos.xz / uLayerScale[i], float(i));
          terrainCol += texture(tTerrainColor, uvw).rgb * uLayerTint[i] * w[i];
          vec4 nr = texture(tTerrainNormal, uvw);
          vec3 nt = nr.xyz * 2.0 - 1.0;
          terrainN += vec3(nt.x + tN.x, abs(nt.z) * tN.y, nt.y + tN.z) * w[i];
          terrainRough += nr.a * w[i];
        }
        if (w[5] >= 0.003) {
          vec3 tw = osTriWeights(tN);
          vec3 sg = vec3(tN.x < 0.0 ? -1.0 : 1.0, tN.y < 0.0 ? -1.0 : 1.0, tN.z < 0.0 ? -1.0 : 1.0);
          float s = uLayerScale[5];
          vec2 ux = vTpPos.zy / s; ux.x *= sg.x;
          vec2 uy = vTpPos.xz / s; uy.x *= sg.y;
          vec2 uz = vTpPos.xy / s; uz.x *= -sg.z;
          float layer = float(${ROCK_LAYER});
          terrainCol += (texture(tTerrainColor, vec3(ux, layer)).rgb * tw.x + texture(tTerrainColor, vec3(uy, layer)).rgb * tw.y + texture(tTerrainColor, vec3(uz, layer)).rgb * tw.z) * uLayerTint[5] * w[5];
          vec4 rx = texture(tTerrainNormal, vec3(ux, layer));
          vec4 ry = texture(tTerrainNormal, vec3(uy, layer));
          vec4 rz = texture(tTerrainNormal, vec3(uz, layer));
          vec3 nx = rx.xyz * 2.0 - 1.0; nx.x *= sg.x;
          vec3 ny = ry.xyz * 2.0 - 1.0; ny.x *= sg.y;
          vec3 nz = rz.xyz * 2.0 - 1.0; nz.x *= -sg.z;
          nx = vec3(nx.xy + tN.zy, abs(nx.z) * tN.x);
          ny = vec3(ny.xy + tN.xz, abs(ny.z) * tN.y);
          nz = vec3(nz.xy + tN.xy, abs(nz.z) * tN.z);
          terrainN += normalize(nx.zyx * tw.x + ny.xzy * tw.y + nz.xyz * tw.z) * w[5];
          terrainRough += (rx.a * tw.x + ry.a * tw.y + rz.a * tw.z) * w[5];
        }
        // Large-scale variation hides tiling; the seabed darkens with depth.
        terrainCol *= 0.8 + 0.4 * osNoise(vTpPos.xz * 0.06 + 7.0);
        terrainCol *= mix(1.0, 0.4, smoothstep(uSea, uSea - 3.0, vTpPos.y));
        float wet = max(uWet * (0.35 + 0.65 * nA), 1.0 - smoothstep(uSea + 0.2, uSea + 1.4, vTpPos.y));
        terrainCol *= mix(1.0, 0.7, wet);
        terrainRough *= mix(1.0, 0.38, wet);
        diffuseColor.rgb *= terrainCol;`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(terrainRough, 0.05, 1.0);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(normalize(terrainN), 0.0)).xyz);')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.78, 0.5) * vLight * 1.6;',
      );
  };
  material.customProgramCacheKey = () => 'terrain-splat';
  return material;
}
