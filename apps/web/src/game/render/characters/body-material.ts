import * as THREE from 'three';
import type { FigureLook } from '../figure';

/**
 * Body regions, by each vertex's dominant bone. The base bodies are bare, so the uniform is
 * painted on in the shader: each region shows skin (the body texture, tinted) or cloth.
 */
export const Region = { Head: 0, Torso: 1, Legs: 2, Feet: 3, Hands: 4, Forearms: 5, Neck: 6 } as const;
const REGIONS = 7;

/** Region of a bone (UE-style mannequin names, shared by the bodies and the animation library). */
export function regionOfBone(name: string): number {
  if (name === 'Head') return Region.Head;
  if (name.startsWith('neck')) return Region.Neck;
  if (/^(hand|index|middle|ring|pinky|thumb)_/.test(name)) return Region.Hands;
  if (name.startsWith('lowerarm')) return Region.Forearms;
  if (/^(foot|ball)_/.test(name)) return Region.Feet;
  if (/^(thigh|calf)_/.test(name) || name === 'pelvis') return Region.Legs;
  return Region.Torso;
}

/**
 * Adds `aRegion` (dominant bone's region) and `aHeight` (0 at the soles, 1 at the crown) to a
 * skinned body geometry. Done once per source geometry; clones share it.
 */
export function tagRegions(mesh: THREE.SkinnedMesh): void {
  const geometry = mesh.geometry;
  if (geometry.getAttribute('aRegion')) return;
  const index = geometry.getAttribute('skinIndex');
  const weight = geometry.getAttribute('skinWeight');
  const position = geometry.getAttribute('position');
  const regions = mesh.skeleton.bones.map((bone) => regionOfBone(bone.name));
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const count = position.count;
  const region = new Float32Array(count);
  const height = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let best = 0;
    for (let k = 1; k < 4; k += 1) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
    region[i] = regions[index.getComponent(i, best)] ?? Region.Torso;
    height[i] = (position.getY(i) - min.y) / Math.max(1e-3, max.y - min.y);
  }
  geometry.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
  geometry.setAttribute('aHeight', new THREE.BufferAttribute(height, 1));
  smoothClothed(geometry, region);
}

/** Regions every outfit covers: their anatomy is smoothed away so the cloth reads as cloth. */
const ALWAYS_CLOTHED = new Set<number>([Region.Torso, Region.Legs, Region.Feet]);

/**
 * Laplacian smoothing of the always-clothed regions (rest pose): muscles, toes and the like melt
 * into the soft shapes of fabric and boots. Vertices split along UV seams move together, and the
 * normals are rebuilt from the welded surface so the seams stay invisible.
 */
function smoothClothed(geometry: THREE.BufferGeometry, region: Float32Array): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const index = geometry.getIndex();
  if (!index) return;
  const count = position.count;
  // Weld by position.
  const ids = new Int32Array(count);
  const keys = new Map<string, number>();
  const points: THREE.Vector3[] = [];
  const clothed: boolean[] = [];
  for (let i = 0; i < count; i += 1) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
    let id = keys.get(key);
    if (id === undefined) {
      id = points.length;
      keys.set(key, id);
      points.push(new THREE.Vector3().fromBufferAttribute(position, i));
      clothed.push(true);
    }
    ids[i] = id;
    // A welded point is smoothed only if every copy of it is clothed (keeps cuffs and collars put).
    if (!ALWAYS_CLOTHED.has(region[i]!)) clothed[id] = false;
  }
  const neighbours: Set<number>[] = points.map(() => new Set());
  for (let f = 0; f < index.count; f += 3) {
    const a = ids[index.getX(f)]!;
    const b = ids[index.getX(f + 1)]!;
    const c = ids[index.getX(f + 2)]!;
    neighbours[a]!.add(b).add(c);
    neighbours[b]!.add(a).add(c);
    neighbours[c]!.add(a).add(b);
  }
  // Plain Laplacian steps melt the anatomy (shrinking it a little: the cloth inflation in the
  // shader gives the volume back), then Taubin steps (shrink, inflate) even out the result.
  const next = points.map((p) => p.clone());
  const avg = new THREE.Vector3();
  for (let pass = 0; pass < 36; pass += 1) {
    const factor = pass < 16 ? 0.5 : pass % 2 === 0 ? 0.6 : -0.62;
    for (let id = 0; id < points.length; id += 1) {
      if (!clothed[id]) continue;
      avg.set(0, 0, 0);
      for (const n of neighbours[id]!) avg.add(points[n]!);
      avg.divideScalar(Math.max(1, neighbours[id]!.size));
      next[id]!.lerpVectors(points[id]!, avg, factor);
    }
    for (let id = 0; id < points.length; id += 1) if (clothed[id]) points[id]!.copy(next[id]!);
  }
  // Welded normals from the smoothed surface.
  const normals = points.map(() => new THREE.Vector3());
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let f = 0; f < index.count; f += 3) {
    const a = ids[index.getX(f)]!;
    const b = ids[index.getX(f + 1)]!;
    const c = ids[index.getX(f + 2)]!;
    ab.subVectors(points[b]!, points[a]!);
    ac.subVectors(points[c]!, points[a]!);
    const n = ab.cross(ac);
    normals[a]!.add(n);
    normals[b]!.add(n);
    normals[c]!.add(n);
  }
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < count; i += 1) {
    const id = ids[i]!;
    if (!clothed[id]) continue;
    const p = points[id]!;
    position.setXYZ(i, p.x, p.y, p.z);
    const n = normals[id]!.normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** Average colour of the light skin texture: the look's skin colour is relative to it. */
const TEXTURE_SKIN = new THREE.Color('#c99a7c');

interface Paint {
  /** Belt colour, or null for none (wetsuits). */
  belt: THREE.Color | null;
  colors: THREE.Color[];
  cloth: number[];
  rough: number[];
  inflate: number[];
  bootTop: number;
  bootColor: THREE.Color;
}

/** What each region wears for a look. */
function paintFor(look: FigureLook): Paint {
  const wetsuit = look.outfit === 'wetsuit';
  const coat = new THREE.Color(look.coat);
  const trousers = new THREE.Color(look.trousers);
  const skin = new THREE.Color(look.skin);
  const gloves = (look.gear ?? []).includes('gloves') || wetsuit;
  const heavy = look.outfit === 'greatcoat' || look.outfit === 'officer-coat' || look.outfit === 'trench-coat';
  const sleeve = look.outfit === 'work-shirt' ? new THREE.Color('#5f6872') : coat;
  const rolled = look.outfit === 'work-shirt';
  const hood = look.headgear === 'hood';
  const colors = Array.from({ length: REGIONS }, () => skin.clone());
  const cloth = new Array<number>(REGIONS).fill(0);
  colors[Region.Torso] = sleeve.clone();
  cloth[Region.Torso] = 1;
  colors[Region.Legs] = trousers;
  cloth[Region.Legs] = 1;
  colors[Region.Feet] = new THREE.Color(look.boots === 'wetsuit' ? '#141719' : look.boots === 'tall' ? '#111214' : (look.bootColor ?? '#2b241e'));
  cloth[Region.Feet] = 1;
  colors[Region.Forearms] = rolled ? skin.clone() : sleeve.clone();
  cloth[Region.Forearms] = rolled ? 0 : 1;
  colors[Region.Hands] = gloves ? new THREE.Color('#1c1f22') : skin.clone();
  cloth[Region.Hands] = gloves ? 1 : 0;
  // High collars and roll necks cover the neck; a hood covers it too.
  const collar = heavy || look.outfit === 'sweater' || wetsuit || hood;
  colors[Region.Neck] = collar ? (hood ? new THREE.Color(look.headgearColor) : coat.clone()) : skin.clone();
  cloth[Region.Neck] = collar ? 1 : 0;
  const rough = cloth.map((c): number => (c ? (wetsuit ? 0.42 : 0.92) : 0.6));
  rough[Region.Feet] = wetsuit ? 0.4 : 0.5;
  // Cloth stands off the body a little (coats more), hiding the anatomy underneath.
  const inflate = new Array<number>(REGIONS).fill(0);
  inflate[Region.Torso] = wetsuit ? 0.002 : heavy ? 0.024 : 0.014;
  inflate[Region.Forearms] = rolled ? 0 : inflate[Region.Torso]! * 0.7;
  inflate[Region.Legs] = wetsuit ? 0.002 : 0.012;
  inflate[Region.Feet] = wetsuit ? 0.004 : 0.014;
  inflate[Region.Neck] = collar ? 0.012 : 0;
  inflate[Region.Hands] = gloves ? 0.003 : 0;
  const bootTop = look.boots === 'tall' ? 0.27 : look.boots === 'puttees' ? 0.2 : look.boots === 'heels' ? 0.035 : 0.075;
  const bootColor = look.boots === 'puttees' ? new THREE.Color('#62665b') : colors[Region.Feet]!.clone();
  const belt = wetsuit ? null : new THREE.Color(heavy ? '#5b3a24' : look.outfit === 'trench-coat' ? look.coat : '#4a4231');
  return { belt, colors, cloth, rough, inflate, bootTop, bootColor };
}

/**
 * The body material for one look: the source material (skin texture, normal and roughness maps)
 * with the uniform painted over the clothed regions, a woven-fabric grain, and the muscle detail
 * of the normal map flattened under cloth.
 */
export function bodyMaterial(source: THREE.MeshStandardMaterial, look: FigureLook): THREE.MeshStandardMaterial {
  const material = source.clone();
  // The skin normal map aliases into stripes at game distances; keep only a hint of it.
  material.normalScale.setScalar(0.35);
  const paint = paintFor(look);
  const skinTint = new THREE.Color(look.skin).multiply(new THREE.Color(1 / TEXTURE_SKIN.r, 1 / TEXTURE_SKIN.g, 1 / TEXTURE_SKIN.b));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRegionColor = { value: paint.colors };
    shader.uniforms.uRegionCloth = { value: paint.cloth };
    shader.uniforms.uRegionRough = { value: paint.rough };
    shader.uniforms.uRegionInflate = { value: paint.inflate };
    shader.uniforms.uBootTop = { value: paint.bootTop };
    shader.uniforms.uBootColor = { value: paint.bootColor };
    shader.uniforms.uSkinTint = { value: skinTint };
    shader.uniforms.uBelt = { value: paint.belt ?? new THREE.Color() };
    shader.uniforms.uHasBelt = { value: paint.belt ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aRegion;
        attribute float aHeight;
        uniform float uRegionInflate[${REGIONS}];
        uniform float uBootTop;
        varying float vRegion;
        varying float vHeight;
        varying vec3 vBodyPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRegion = aRegion;
        vHeight = aHeight;
        vBodyPos = position;
        int bodyRegion = int(aRegion + 0.5);
        float bodyInflate = uRegionInflate[bodyRegion];
        if (bodyRegion == 2 && aHeight < uBootTop) bodyInflate = max(bodyInflate, uRegionInflate[3]);
        transformed += normal * bodyInflate;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uRegionColor[${REGIONS}];
        uniform float uRegionCloth[${REGIONS}];
        uniform float uRegionRough[${REGIONS}];
        uniform float uBootTop;
        uniform vec3 uBootColor;
        uniform vec3 uSkinTint;
        uniform vec3 uBelt;
        uniform float uHasBelt;
        varying float vRegion;
        varying float vHeight;
        varying vec3 vBodyPos;
        float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float bNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(bHash(i), bHash(i + vec3(1,0,0)), f.x), mix(bHash(i + vec3(0,1,0)), bHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(bHash(i + vec3(0,0,1)), bHash(i + vec3(1,0,1)), f.x), mix(bHash(i + vec3(0,1,1)), bHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        int bodyRegion = int(vRegion + 0.5);
        float clothMask = uRegionCloth[bodyRegion];
        vec3 clothColor = uRegionColor[bodyRegion];
        float clothRough = uRegionRough[bodyRegion];
        if (bodyRegion == 2 && vHeight < uBootTop) {
          clothColor = uBootColor;
          clothRough = uRegionRough[3];
        }
        {
          // Creases, seams and dirt: low-frequency mottling plus a fine grain.
          float folds = bNoise(vBodyPos * vec3(14.0, 5.0, 14.0)) * 0.6 + bNoise(vBodyPos * 46.0) * 0.4;
          float dirt = smoothstep(0.25, 0.0, vHeight) * 0.25;
          vec3 cloth = clothColor * (0.78 + 0.34 * folds) * (1.0 - dirt);
          // Garment lines: belt at the waist, a button placket down the front, darker cuffs.
          if (uHasBelt > 0.5 && abs(vHeight - 0.575) < 0.014 && (bodyRegion == 1 || bodyRegion == 2)) cloth = uBelt * (0.85 + 0.2 * folds);
          if (bodyRegion == 1 && vHeight > 0.6 && vHeight < 0.8 && vBodyPos.z > 0.0 && abs(vBodyPos.x) < 0.008) cloth *= 0.72;
          if (bodyRegion == 5 && clothMask > 0.5 && vHeight < 0.5) cloth *= 0.8;
          diffuseColor.rgb = mix(diffuseColor.rgb * uSkinTint, cloth, clothMask);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, clothRough, clothMask);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, clothMask));`,
      );
  };
  material.customProgramCacheKey = () => 'authored-body-v1';
  return material;
}
