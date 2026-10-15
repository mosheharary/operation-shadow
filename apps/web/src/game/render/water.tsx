'use client';

import { CellFlag, Grid, type LevelData } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE_GLSL } from './materials/surface';

const NORMAL_SIZE = 256;

/** Tileable wave normal map from periodic value noise (generated once, no image asset). */
function waveNormalTexture(): THREE.DataTexture {
  const N = NORMAL_SIZE;
  const height = new Float32Array(N * N);
  const lattice = (period: number, seed: number) => {
    const g = new Float32Array(period * period);
    let s = seed;
    for (let i = 0; i < g.length; i += 1) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      g[i] = s / 4294967296;
    }
    return g;
  };
  const octaves = [
    { period: 8, amp: 1, g: lattice(8, 11) },
    { period: 16, amp: 0.5, g: lattice(16, 23) },
    { period: 32, amp: 0.25, g: lattice(32, 37) },
    { period: 64, amp: 0.12, g: lattice(64, 51) },
  ];
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      let h = 0;
      for (const o of octaves) {
        const fx = (x / N) * o.period;
        const fy = (y / N) * o.period;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const at = (i: number, j: number) => o.g[((j % o.period) * o.period + (i % o.period)) | 0]!;
        const a = at(x0, y0);
        const b = at(x0 + 1, y0);
        const c = at(x0, y0 + 1);
        const d = at(x0 + 1, y0 + 1);
        h += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * o.amp;
      }
      height[y * N + x] = h;
    }
  }
  const data = new Uint8Array(N * N * 4);
  const strength = 2.2;
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const hx = height[y * N + ((x + 1) % N)]! - height[y * N + ((x - 1 + N) % N)]!;
      const hy = height[((y + 1) % N) * N + x]! - height[((y - 1 + N) % N) * N + x]!;
      const n = new THREE.Vector3(-hx * strength, -hy * strength, 1).normalize();
      data.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], (y * N + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Per-cell distance to the nearest shore or structure (R) and water depth (G), for foam and tint. */
function shoreTexture(level: LevelData): THREE.DataTexture {
  const { cols, rows } = level;
  const dist = new Float32Array(cols * rows).fill(Infinity);
  const queue: number[] = [];
  const water = (cell: number) => (level.flags[cell]! & (CellFlag.Deep | CellFlag.Shallow)) !== 0;
  for (let cell = 0; cell < cols * rows; cell += 1) {
    if (!water(cell)) {
      dist[cell] = 0;
      queue.push(cell);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]!;
    const col = cell % cols;
    const row = (cell - col) / cols;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const n = r * cols + c;
      if (dist[n]! <= dist[cell]! + 1) continue;
      dist[n] = dist[cell]! + 1;
      if (dist[n]! < 16) queue.push(n);
    }
  }
  const grid = new Grid(level);
  const data = new Uint8Array(cols * rows * 4);
  for (let cell = 0; cell < cols * rows; cell += 1) {
    const metres = Math.min(8, (dist[cell] ?? 16) * level.cellSize);
    const depth = Math.max(0, level.seaLevel - grid.heightAt(grid.center(cell)));
    data.set([(metres / 8) * 255, Math.min(1, depth / 5) * 255, 0, 255], cell * 4);
  }
  const texture = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function edgeGeometry(level: LevelData): THREE.BufferGeometry {
  const grid = new Grid(level);
  const positions: number[] = [];
  const top = level.seaLevel - 0.12;
  const step = 0.5;
  const sides: [number, number, number, number][] = [
    [0, 0, 1, 0],
    [level.width, 0, 0, 1],
    [level.width, level.depth, -1, 0],
    [0, level.depth, 0, -1],
  ];
  for (const [sx, sz, dx, dz] of sides) {
    const len = dx !== 0 ? level.width : level.depth;
    for (let t = 0; t < len; t += step) {
      const a = { x: sx + dx * t, z: sz + dz * t };
      const b = { x: sx + dx * (t + step), z: sz + dz * (t + step) };
      const ha = grid.heightAt(a);
      const hb = grid.heightAt(b);
      if (ha >= top && hb >= top) continue;
      const ba = Math.min(ha, top);
      const bb = Math.min(hb, top);
      positions.push(a.x, top, a.z, a.x, ba, a.z, b.x, top, b.z, b.x, top, b.z, a.x, ba, a.z, b.x, bb, b.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The sea: a gently swelling surface with animated wave normals (sharp moon and lamp glints),
 * depth tint over the sea bed, foam along shores, quay walls and posts, and a translucent cut
 * edge where the diorama block ends.
 */
export function Water({ level }: { level: LevelData }) {
  const hasWater = useMemo(() => level.flags.some((f) => (f & CellFlag.Deep) !== 0), [level]);
  return hasWater ? <Sea level={level} /> : null;
}

function Sea({ level }: { level: LevelData }) {
  const { geometry, material, uniforms, edge, edgeMaterial } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(level.width, level.depth, 160, 120);
    geo.rotateX(-Math.PI / 2);
    geo.translate(level.width / 2, level.seaLevel - 0.12, level.depth / 2);
    const u = {
      uTime: { value: 0 },
      tWaves: { value: waveNormalTexture() },
      tShore: { value: shoreTexture(level) },
      uMapSize: { value: new THREE.Vector2(level.width, level.depth) },
    };
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.08, metalness: 0.05, transparent: true, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWorld;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float swell = sin(position.x * 0.21 + uTime * 0.8) * 0.06 + cos(position.z * 0.17 + uTime * 0.65) * 0.05;
          transformed.y += swell;
          vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform sampler2D tWaves;
          uniform sampler2D tShore;
          uniform vec2 uMapSize;
          varying vec3 vWorld;
          ${NOISE_GLSL}`,
        )
        .replace(
          '#include <map_fragment>',
          `vec4 shoreInfo = texture2D(tShore, vWorld.xz / uMapSize);
          float shoreDist = shoreInfo.r * 8.0;
          float depth = shoreInfo.g * 5.0;
          vec3 deepCol = vec3(0.028, 0.055, 0.07);
          vec3 shallowCol = vec3(0.09, 0.16, 0.17);
          vec3 waterCol = mix(shallowCol, deepCol, smoothstep(0.2, 3.5, depth));
          float foamNoise = osNoise(vWorld.xz * 3.1 + vec2(uTime * 0.5, -uTime * 0.35)) * 0.65 + osNoise(vWorld.xz * 8.0 - uTime * 0.8) * 0.35;
          float band = 1.0 - smoothstep(0.0, 0.9, shoreDist);
          float lap = 0.5 + 0.5 * sin(shoreDist * 7.0 - uTime * 2.0);
          float foam = smoothstep(0.6, 0.85, foamNoise * (0.55 + 0.45 * lap)) * band * 0.85;
          diffuseColor.rgb = mix(waterCol, vec3(0.62, 0.68, 0.7), foam);
          diffuseColor.a = mix(mix(0.6, 0.94, smoothstep(0.1, 2.0, depth)), 0.95, foam);
          vec3 waterN = vec3(0.0, 1.0, 0.0);`,
        )
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.06, 0.6, foam);')
        .replace(
          '#include <normal_fragment_maps>',
          `{
            vec3 w1 = texture2D(tWaves, vWorld.xz * 0.16 + vec2(uTime * 0.02, uTime * 0.013)).xyz * 2.0 - 1.0;
            vec3 w2 = texture2D(tWaves, vWorld.xz * 0.37 - vec2(uTime * 0.026, -uTime * 0.019)).xyz * 2.0 - 1.0;
            vec3 w3 = texture2D(tWaves, vWorld.xz * 0.9 + vec2(-uTime * 0.05, uTime * 0.04)).xyz * 2.0 - 1.0;
            vec2 slope = (w1.xy * 0.5 + w2.xy * 0.45 + w3.xy * 0.35) * mix(1.0, 0.4, foam);
            waterN = normalize(vec3(slope.x, 1.0, slope.y));
            normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // No environment map: a fresnel sky sheen and moon glints make the chop visible at night.
            vec3 viewDir = normalize(cameraPosition - vWorld);
            float fres = pow(1.0 - clamp(dot(viewDir, waterN), 0.0, 1.0), 3.0);
            vec3 refl = reflect(-viewDir, waterN);
            float glint = pow(max(dot(refl, normalize(vec3(0.42, 0.77, -0.48))), 0.0), 140.0);
            float sparkle = pow(max(dot(refl, normalize(vec3(-0.3, 0.9, 0.3))), 0.0), 260.0);
            totalEmissiveRadiance += (vec3(0.09, 0.13, 0.19) * fres + vec3(0.8, 0.85, 0.9) * (glint * 1.2 + sparkle * 0.6)) * (1.0 - foam);
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'water-v3';
    const edgeMat = new THREE.MeshStandardMaterial({ color: '#0d2229', roughness: 0.2, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
    return { geometry: geo, material: mat, uniforms: u, edge: edgeGeometry(level), edgeMaterial: edgeMat };
  }, [level]);

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  return (
    <>
      <mesh name="water" geometry={geometry} material={material} renderOrder={1} receiveShadow />
      <mesh name="water-edge" geometry={edge} material={edgeMaterial} renderOrder={1} />
    </>
  );
}
