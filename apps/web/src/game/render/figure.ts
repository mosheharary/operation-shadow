import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowSprite } from './glows';
import { material } from './palette';

// Characters: a detailed procedural figure matching the approved concept sheets
// (samples/images/squad_lineup.jpg, enemy_uniforms.jpg). Every body segment is merged into one
// mesh with per-vertex colour and surface (roughness, metalness, fabric), so a figure costs about
// a dozen draw calls however much detail it carries.

export type Headgear = 'ridged-helmet' | 'kepi' | 'beanie' | 'field-cap' | 'steel-helmet' | 'beret' | 'bare' | 'hood';

export type Outfit = 'sweater' | 'field-jacket' | 'work-shirt' | 'trench-coat' | 'tunic' | 'wetsuit' | 'greatcoat' | 'officer-coat' | 'shirt';

export type Gear =
  | 'rope'
  | 'knife'
  | 'binoculars'
  | 'satchel'
  | 'large-pack'
  | 'small-pack'
  | 'bedroll'
  | 'tools'
  | 'suspenders'
  | 'armband'
  | 'medic-bag'
  | 'glasses'
  | 'dinghy'
  | 'fins'
  | 'face-paint'
  | 'cross-straps'
  | 'belt-pouches'
  | 'stubble'
  | 'mustache'
  | 'cape'
  | 'gloves';

export interface FigureLook {
  outfit: Outfit;
  coat: string;
  trousers: string;
  skin: string;
  hair: string;
  hairStyle: 'short' | 'bob' | 'receding' | 'cropped';
  headgear: Headgear;
  headgearColor: string;
  /** Collar tabs, piping. */
  accent?: string;
  boots: 'ankle' | 'tall' | 'puttees' | 'heels' | 'wetsuit';
  bootColor?: string;
  gear?: Gear[];
  packColor?: string;
  weapon?: 'rifle' | 'scoped-rifle' | 'harpoon' | 'none';
  lantern?: boolean;
  /** Body proportions: 1 is average; women and slight builds use about 0.9. */
  build?: number;
  /** Overall height multiplier (about 0.95 to 1.05). */
  height?: number;
}

export interface FigurePose {
  stance: 'stand' | 'crouch' | 'prone';
  moving: boolean;
  running: boolean;
  lying: 'none' | 'back' | 'side';
  carrying: boolean;
  carried: boolean;
  aiming: boolean;
  talking: boolean;
  swimming: boolean;
  climbing: boolean;
}

export interface FigureRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  chest: THREE.Object3D;
  skirt: THREE.Object3D | null;
  weapon: THREE.Object3D | null;
  lanternLight: THREE.Object3D | null;
  phase: number;
}

// ── Geometry building ─────────────────────────────────────────────────────────────────────────

/** Surface of a part: roughness, metalness, and how much woven-fabric detail it shows. */
interface Surface {
  r: number;
  m: number;
  f: number;
}
const CLOTH: Surface = { r: 0.92, m: 0, f: 1 };
const WOOL: Surface = { r: 0.96, m: 0, f: 1.3 };
const SKIN: Surface = { r: 0.62, m: 0, f: 0.05 };
const HAIR: Surface = { r: 0.75, m: 0, f: 0.6 };
const LEATHER: Surface = { r: 0.55, m: 0, f: 0.15 };
const RUBBER: Surface = { r: 0.38, m: 0, f: 0.05 };
const METAL: Surface = { r: 0.42, m: 0.55, f: 0 };
const BRASS: Surface = { r: 0.3, m: 0.85, f: 0 };
const WOOD: Surface = { r: 0.6, m: 0, f: 0.2 };
const GLASS: Surface = { r: 0.15, m: 0.3, f: 0 };

/** Collects coloured parts for one body segment and merges them into a single geometry. */
class Parts {
  private list: THREE.BufferGeometry[] = [];

  add(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, surface: Surface, matrix?: THREE.Matrix4): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position!.count;
    const base = new THREE.Color(color);
    const colors = new Float32Array(count * 3);
    const mats = new Float32Array(count * 3);
    const n = g.attributes.normal!;
    for (let i = 0; i < count; i += 1) {
      // Baked hemispheric occlusion: faces pointing down and into folds read darker.
      const occl = 0.78 + 0.22 * (n.getY(i) * 0.5 + 0.5);
      colors[i * 3] = base.r * occl;
      colors[i * 3 + 1] = base.g * occl;
      colors[i * 3 + 2] = base.b * occl;
      mats[i * 3] = surface.r;
      mats[i * 3 + 1] = surface.m;
      mats[i * 3 + 2] = surface.f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aSurface', new THREE.BufferAttribute(mats, 3));
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'color', 'aSurface'].includes(name)) g.deleteAttribute(name);
    }
    this.list.push(g);
    return this;
  }

  build(): THREE.BufferGeometry | null {
    if (this.list.length === 0) return null;
    const merged = mergeGeometries(this.list);
    for (const g of this.list) g.dispose();
    this.list = [];
    return merged;
  }
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

/** Transform: translate, rotate (XYZ Euler) and scale. */
function at(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)).clone();
}

/** A surface of revolution about +y from (radius, y) pairs, flattened front-to-back by `depth`. */
function lathe(profile: [number, number][], segments = 14): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

const unitSphere = (w = 14, h = 10) => new THREE.SphereGeometry(1, w, h);
const cyl = (rTop: number, rBottom: number, h: number, seg = 12, open = false) => new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
const boxG = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Tapered limb from y = 0 down to y = -length, with a rounded joint at the top. */
function limb(length: number, r0: number, r1: number, bulge = 1.08): THREE.BufferGeometry {
  // Hemispherical caps at both joints let neighbouring segments overlap without a visible seam.
  const cap = (r: number, y: number, dir: 1 | -1): [number, number][] =>
    [0, 0.38, 0.7, 0.92].map((t) => [Math.max(0.001, r * Math.sin((t * Math.PI) / 2)), y + dir * r * Math.cos((t * Math.PI) / 2)] as [number, number]);
  return lathe(
    [
      ...cap(r0, 0, 1),
      [r0, 0],
      [r0 * bulge, -length * 0.2],
      [(r0 + r1) * 0.5 * (1 + (bulge - 1) * 0.5), -length * 0.6],
      [r1, -length],
      ...cap(r1, -length, -1).reverse(),
    ],
    12,
  );
}

// ── Material ──────────────────────────────────────────────────────────────────────────────────

let figureMaterial: THREE.MeshStandardMaterial | null = null;

/**
 * One shared material for every figure: vertex colours, per-vertex roughness and metalness, and
 * an object-space fabric weave and wear pattern (bump-mapped from screen-space derivatives,
 * faded out when a figure is small on screen so it never shimmers).
 */
export function getFigureMaterial(): THREE.MeshStandardMaterial {
  if (figureMaterial) return figureMaterial;
  // Double-sided: coat skirts and capes are open surfaces.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSurface;\nvarying vec3 vSurface;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = aSurface;\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSurface;
        varying vec3 vObj;
        float fHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float fNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(fHash(i), fHash(i + vec3(1,0,0)), f.x), mix(fHash(i + vec3(0,1,0)), fHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(fHash(i + vec3(0,0,1)), fHash(i + vec3(1,0,1)), f.x), mix(fHash(i + vec3(0,1,1)), fHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fabricHeight(vec3 p) {
          // Creases and a fine grain (a regular weave aliases into stripes at game distances).
          return fNoise(p * 18.0) * 0.65 + fNoise(p * 55.0) * 0.25 + fNoise(p * 160.0) * 0.1;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // Wear and dirt: low-frequency mottling on cloth, faint on skin and metal.
          float wear = fNoise(vObj * 9.0) * 0.6 + fNoise(vObj * 31.0) * 0.4;
          diffuseColor.rgb *= mix(1.0, 0.84 + 0.3 * wear, clamp(vSurface.z, 0.15, 1.0));
        }`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurface.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurface.y;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float pixel = length(fwidth(vObj));
          float detail = vSurface.z * clamp(1.0 - pixel * 420.0, 0.0, 1.0);
          if (detail > 0.01) {
            float h = fabricHeight(vObj) * 0.0006 * detail;
            vec3 sigmaX = dFdx(-vViewPosition);
            vec3 sigmaY = dFdy(-vViewPosition);
            vec3 r1 = cross(sigmaY, normal);
            vec3 r2 = cross(normal, sigmaX);
            float det = dot(sigmaX, r1);
            vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
            normal = normalize(abs(det) * normal - grad);
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'figure-v4';
  figureMaterial = mat;
  return mat;
}

function segmentMesh(parts: Parts): THREE.Mesh | null {
  const geometry = parts.build();
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, getFigureMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const shade = (color: string, k: number) => new THREE.Color(color).multiplyScalar(k);
const BRASS_COLOR = '#b08d4a';
const LEATHER_BROWN = '#5b3a24';
const DARK_LEATHER = '#2a211b';

// ── Head ──────────────────────────────────────────────────────────────────────────────────────

function buildHead(p: Parts, look: FigureLook): void {
  const skin = look.skin;
  const gear = new Set(look.gear ?? []);
  const female = (look.build ?? 1) < 0.95;
  // Skull, cheeks and jaw.
  p.add(unitSphere(16, 12), skin, SKIN, at(0, 0.115, 0, 0, 0, 0, 0.098, 0.117, female ? 0.084 : 0.09));
  p.add(unitSphere(12, 8), skin, SKIN, at(0.028, 0.055, 0, 0, 0, 0.25, 0.07, female ? 0.05 : 0.058, female ? 0.062 : 0.072));
  // Neck.
  p.add(cyl(0.045, 0.052, 0.12, 10), skin, SKIN, at(-0.005, -0.02, 0));
  // Nose, brow ridge, ears.
  p.add(unitSphere(8, 6), shade(skin, 0.97), SKIN, at(0.094, 0.1, 0, 0, 0, 0.3, 0.017, 0.026, 0.013));
  p.add(unitSphere(8, 6), shade(skin, 0.95), SKIN, at(0.086, 0.148, 0, 0, 0, 0, 0.02, 0.014, 0.07));
  for (const side of [-1, 1]) {
    p.add(unitSphere(8, 6), shade(skin, 0.92), SKIN, at(-0.005, 0.11, side * 0.088, 0, 0, 0, 0.022, 0.034, 0.012));
    // Eyes: whites and dark irises, set into the brow.
    p.add(unitSphere(8, 6), '#d9d2c4', SKIN, at(0.083, 0.128, side * 0.032, 0, 0, 0, 0.012, 0.009, 0.016));
    p.add(unitSphere(6, 4), '#2a2420', GLASS, at(0.092, 0.128, side * 0.032, 0, 0, 0, 0.006, 0.008, 0.008));
    // Brows.
    p.add(boxG(0.012, 0.009, 0.034), shade(look.hair, 0.8), HAIR, at(0.094, 0.149, side * 0.033, side * 0.12, 0, 0));
  }
  // Mouth.
  p.add(boxG(0.008, 0.008, 0.036), shade(skin, female ? 0.72 : 0.78), SKIN, at(0.095, 0.058, 0));
  if (gear.has('stubble')) p.add(unitSphere(12, 8), shade(skin, 0.68), HAIR, at(0.03, 0.05, 0, 0, 0, 0.25, 0.072, 0.056, 0.074));
  if (gear.has('mustache')) p.add(boxG(0.016, 0.014, 0.05), look.hair, HAIR, at(0.1, 0.07, 0));
  if (gear.has('face-paint')) {
    for (const side of [-1, 1]) p.add(boxG(0.012, 0.05, 0.03), '#2c3326', SKIN, at(0.088, 0.1, side * 0.05, 0, 0, side * 0.5));
    p.add(boxG(0.012, 0.03, 0.08), '#2c3326', SKIN, at(0.096, 0.155, 0));
  }
  if (gear.has('glasses')) {
    for (const side of [-1, 1]) p.add(new THREE.TorusGeometry(0.019, 0.003, 5, 14), '#1d1b19', METAL, at(0.1, 0.128, side * 0.032, 0, Math.PI / 2, 0));
    p.add(boxG(0.004, 0.004, 0.026), '#1d1b19', METAL, at(0.102, 0.13, 0));
    for (const side of [-1, 1]) p.add(boxG(0.09, 0.004, 0.004), '#1d1b19', METAL, at(0.05, 0.132, side * 0.088));
  }
  // Hair (visible under or without headgear).
  const hair = look.hair;
  if (look.headgear === 'hood') return;
  switch (look.hairStyle) {
    case 'bob':
      p.add(unitSphere(14, 10), hair, HAIR, at(-0.018, 0.12, 0, 0, 0, 0.15, 0.104, 0.122, 0.098));
      p.add(unitSphere(12, 8), hair, HAIR, at(-0.04, 0.06, 0, 0, 0, 0, 0.08, 0.07, 0.1));
      break;
    case 'receding':
      p.add(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, HAIR, at(-0.022, 0.12, 0, 0, 0, 0.55, 0.1, 0.118, 0.094));
      break;
    case 'cropped':
      p.add(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, HAIR, at(-0.008, 0.13, 0, 0, 0, 0.25, 0.1, 0.11, 0.093));
      break;
    default:
      p.add(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, HAIR, at(-0.012, 0.128, 0, 0, 0, 0.3, 0.104, 0.12, 0.096));
  }
}

function buildHeadgear(p: Parts, look: FigureLook): void {
  const c = look.headgearColor;
  switch (look.headgear) {
    case 'ridged-helmet': {
      // Iron Dominion helmet: tall dome, crest and a wide brim, chin strap.
      p.add(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), c, METAL, at(0, 0.15, 0, 0, 0, 0, 0.13, 0.13, 0.125));
      p.add(lathe([[0.125, 0.0], [0.19, -0.035], [0.195, -0.045], [0.12, -0.012]], 18), shade(c, 0.95), METAL, at(0, 0.16, 0, 0, 0, 0, 1, 1, 0.97));
      p.add(boxG(0.25, 0.04, 0.024), shade(c, 1.1), METAL, at(-0.005, 0.27, 0, 0, 0, 0, 1, 1, 1));
      p.add(unitSphere(10, 6), shade(c, 1.1), METAL, at(-0.005, 0.27, 0, 0, 0, 0, 0.12, 0.025, 0.012));
      for (const side of [-1, 1]) p.add(boxG(0.012, 0.13, 0.008), LEATHER_BROWN, LEATHER, at(0.03, 0.08, side * 0.088, 0, 0, -0.3));
      p.add(boxG(0.012, 0.01, 0.15), LEATHER_BROWN, LEATHER, at(0.055, 0.025, 0));
      break;
    }
    case 'steel-helmet': {
      // Coalition steel helmet with a flared skirt.
      p.add(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), c, METAL, at(0, 0.145, 0, 0, 0, 0, 0.128, 0.13, 0.122));
      p.add(lathe([[0.126, 0.02], [0.14, -0.04], [0.155, -0.06], [0.15, -0.065]], 18), shade(c, 0.92), METAL, at(0, 0.145, 0));
      for (const side of [-1, 1]) p.add(boxG(0.01, 0.12, 0.008), DARK_LEATHER, LEATHER, at(0.02, 0.07, side * 0.09, 0, 0, -0.2));
      break;
    }
    case 'kepi': {
      p.add(cyl(0.104, 0.098, 0.08, 18), c, CLOTH, at(-0.005, 0.22, 0));
      p.add(cyl(0.125, 0.105, 0.03, 18), c, CLOTH, at(-0.012, 0.27, 0, 0, 0, 0.08, 1.04, 1, 1));
      p.add(cyl(0.099, 0.1, 0.022, 18), look.accent ?? shade(c, 0.6), CLOTH, at(-0.005, 0.19, 0));
      p.add(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), '#16181b', LEATHER, at(0.04, 0.185, 0, 0, 0, -0.18, 0.9, 1, 1));
      // Iron-crown badge.
      p.add(boxG(0.008, 0.024, 0.03), '#c8ccd1', METAL, at(0.104, 0.225, 0));
      for (const z of [-0.012, 0, 0.012]) p.add(new THREE.ConeGeometry(0.005, 0.016, 4), '#c8ccd1', METAL, at(0.104, 0.244, z));
      break;
    }
    case 'field-cap': {
      p.add(cyl(0.1, 0.104, 0.07, 16), c, CLOTH, at(-0.006, 0.215, 0));
      p.add(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), c, CLOTH, at(-0.006, 0.25, 0, 0, 0, 0, 0.1, 0.035, 0.1));
      p.add(new THREE.CylinderGeometry(0.095, 0.095, 0.01, 14, 1, false, -Math.PI / 2, Math.PI), shade(c, 0.85), CLOTH, at(0.05, 0.19, 0, 0, 0, -0.12, 0.85, 1, 1));
      p.add(boxG(0.006, 0.014, 0.014), BRASS_COLOR, BRASS, at(0.1, 0.225, 0));
      break;
    }
    case 'beanie': {
      p.add(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), c, WOOL, at(-0.01, 0.15, 0, 0, 0, 0.12, 0.108, 0.115, 0.1));
      p.add(cyl(0.11, 0.108, 0.04, 18), shade(c, 0.9), WOOL, at(-0.008, 0.155, 0, 0, 0, 0.12, 1, 1, 0.93));
      break;
    }
    case 'beret': {
      p.add(unitSphere(16, 8), c, WOOL, at(-0.02, 0.215, 0.018, 0.25, 0, 0.1, 0.122, 0.04, 0.118));
      p.add(cyl(0.098, 0.1, 0.022, 16), shade(c, 0.85), LEATHER, at(-0.008, 0.195, 0, 0.12, 0, 0.1));
      p.add(unitSphere(6, 4), '#c8b27a', BRASS, at(0.088, 0.215, -0.04, 0, 0, 0, 0.01, 0.014, 0.012));
      break;
    }
    case 'hood': {
      // Wetsuit hood: closed around the head, face open.
      // Open at the front (sphere longitude around +x left out).
      p.add(new THREE.SphereGeometry(1, 18, 12, Math.PI + 0.85, Math.PI * 2 - 1.7), c, RUBBER, at(-0.012, 0.12, 0, 0, 0, 0, 0.106, 0.13, 0.1));
      p.add(cyl(0.06, 0.07, 0.12, 12), c, RUBBER, at(-0.01, -0.01, 0));
      p.add(new THREE.TorusGeometry(0.06, 0.012, 6, 16), shade(c, 0.8), RUBBER, at(0.06, 0.105, 0, 0, Math.PI / 2, 0, 1, 1.3, 1));
      break;
    }
    case 'bare':
      break;
  }
}

// ── Body ──────────────────────────────────────────────────────────────────────────────────────

interface Built {
  pelvis: Parts;
  /** Coat skirt: its own mesh so it can follow the thighs when crouching or lying. */
  skirt: Parts;
  chest: Parts;
  head: Parts;
  upper: [Parts, Parts];
  fore: [Parts, Parts];
  thigh: [Parts, Parts];
  shin: [Parts, Parts];
}

/** Torso profile (radius, height) from the waist up; flattened front to back. */
function torsoShape(build: number, coatBulk: number): THREE.BufferGeometry {
  const w = build;
  return lathe(
    [
      [0.001, -0.02],
      [0.14 * w + coatBulk, 0.0],
      [0.145 * w + coatBulk, 0.12],
      [0.168 * w + coatBulk, 0.28],
      [0.19 * w + coatBulk, 0.38],
      [0.185 * w + coatBulk, 0.445],
      [0.15 * w + coatBulk, 0.49],
      [0.09, 0.52],
      [0.055, 0.54],
      [0.001, 0.545],
    ],
    16,
  );
}

/** Extra radius clothing adds over the body. */
function bulkOf(look: FigureLook): number {
  const o = look.outfit;
  return o === 'greatcoat' || o === 'officer-coat' ? 0.018 : o === 'trench-coat' || o === 'sweater' ? 0.012 : o === 'wetsuit' ? -0.006 : 0.006;
}

function buildBody(look: FigureLook): Built {
  const b: Built = {
    pelvis: new Parts(),
    skirt: new Parts(),
    chest: new Parts(),
    head: new Parts(),
    upper: [new Parts(), new Parts()],
    fore: [new Parts(), new Parts()],
    thigh: [new Parts(), new Parts()],
    shin: [new Parts(), new Parts()],
  };
  const build = look.build ?? 1;
  const gear = new Set(look.gear ?? []);
  const coat = look.coat;
  const trousers = look.trousers;
  const outfit = look.outfit;
  const coatSurface = outfit === 'wetsuit' ? RUBBER : outfit === 'sweater' ? WOOL : CLOTH;
  const trouserSurface = outfit === 'wetsuit' ? RUBBER : CLOTH;
  const heavy = outfit === 'greatcoat' || outfit === 'officer-coat';
  const longSkirt = heavy || outfit === 'trench-coat';
  const bulk = bulkOf(look);

  // Pelvis (hips space, joint at y = 0).
  const pelvis = b.pelvis;
  pelvis.add(unitSphere(14, 10), trousers, trouserSurface, at(0, -0.01, 0, 0, 0, 0, 0.115 * build + bulk, 0.13, 0.165 * build + bulk));
  pelvis.add(cyl(0.142 * build + bulk, 0.15 * build + bulk, 0.11, 16), coat, coatSurface, at(0, 0.075, 0, 0, 0, 0, 0.72, 1, 1));
  // Belt with buckle.
  const beltColor = outfit === 'wetsuit' ? '#3b3f35' : outfit === 'greatcoat' || outfit === 'officer-coat' ? LEATHER_BROWN : outfit === 'trench-coat' ? coat : '#4a4231';
  pelvis.add(cyl(0.152 * build + bulk, 0.152 * build + bulk, 0.045, 18, true), beltColor, LEATHER, at(0, 0.09, 0, 0, 0, 0, 0.74, 1, 1.01));
  pelvis.add(boxG(0.012, 0.045, 0.05), outfit === 'trench-coat' ? shade(coat, 0.8) : BRASS_COLOR, outfit === 'trench-coat' ? LEATHER : BRASS, at(0.113 * build + bulk, 0.09, 0));
  if (gear.has('belt-pouches') || outfit === 'work-shirt' || outfit === 'field-jacket') {
    for (const side of [-1, 1]) {
      pelvis.add(boxG(0.05, 0.06, 0.07), outfit === 'greatcoat' ? LEATHER_BROWN : '#5a5338', LEATHER, at(0.09, 0.075, side * 0.095, 0, side * 0.6, 0));
      pelvis.add(boxG(0.054, 0.014, 0.074), outfit === 'greatcoat' ? shade(LEATHER_BROWN, 0.8) : '#4c4630', LEATHER, at(0.092, 0.105, side * 0.095, 0, side * 0.6, 0));
    }
  }
  if (gear.has('knife')) {
    pelvis.add(boxG(0.035, 0.2, 0.02), DARK_LEATHER, LEATHER, at(0.02, -0.06, -0.17, 0, 0, 0.1));
    pelvis.add(cyl(0.012, 0.012, 0.07, 8), '#3a2f25', WOOD, at(0.03, 0.07, -0.17, 0, 0, 0.1));
  }
  if (gear.has('medic-bag')) {
    pelvis.add(boxG(0.09, 0.15, 0.2), '#6b5a3c', LEATHER, at(0.03, -0.03, 0.2));
    pelvis.add(boxG(0.094, 0.07, 0.204), shade('#6b5a3c', 0.85), LEATHER, at(0.03, 0.03, 0.2));
    pelvis.add(boxG(0.006, 0.07, 0.022), '#f0ece0', CLOTH, at(0.077, -0.03, 0.2));
    pelvis.add(boxG(0.006, 0.022, 0.07), '#f0ece0', CLOTH, at(0.077, -0.03, 0.2));
    pelvis.add(boxG(0.008, 0.05, 0.014), '#2e7d4f', CLOTH, at(0.079, -0.03, 0.2));
    pelvis.add(boxG(0.008, 0.014, 0.05), '#2e7d4f', CLOTH, at(0.079, -0.03, 0.2));
  }
  if (gear.has('satchel')) {
    pelvis.add(boxG(0.07, 0.15, 0.18), '#6a4a2e', LEATHER, at(0.02, -0.02, -0.2));
    pelvis.add(boxG(0.074, 0.08, 0.184), shade('#6a4a2e', 0.82), LEATHER, at(0.022, 0.025, -0.2));
    pelvis.add(boxG(0.012, 0.02, 0.02), BRASS_COLOR, BRASS, at(0.06, 0.0, -0.2));
  }
  if (longSkirt) {
    // Coat skirt from the waist to below the knee (officer: mid-calf), slightly open at the front.
    const length = outfit === 'officer-coat' ? 0.72 : outfit === 'trench-coat' ? 0.58 : 0.6;
    const flare = outfit === 'greatcoat' ? 0.27 : 0.24;
    const skirt = new THREE.LatheGeometry(
      [new THREE.Vector2(0.15 * build + bulk, 0.06), new THREE.Vector2(0.168 * build + bulk, -0.1), new THREE.Vector2((0.17 * build + flare) / 2 + bulk, -length * 0.55), new THREE.Vector2(flare - 0.02, -length)],
      20,
      Math.PI * 0.035,
      Math.PI * 1.93,
    );
    // Rotated so the opening faces forward (+x).
    b.skirt.add(skirt, coat, coatSurface, at(0, 0, 0, 0, Math.PI / 2, 0, 0.75, 1, 1));
    if (outfit === 'greatcoat') {
      // Turned-back skirts and a buttoned front.
      for (let i = 0; i < 2; i += 1) b.skirt.add(unitSphere(6, 4), BRASS_COLOR, BRASS, at(0.12 + i * 0.012, -0.08 - i * 0.14, 0.045, 0, 0, 0, 0.012, 0.012, 0.012));
    }
  } else if (outfit !== 'wetsuit') {
    // Jacket hem over the hips.
    pelvis.add(cyl(0.15 * build + bulk, 0.165 * build + bulk, 0.1, 18, true), coat, coatSurface, at(0, 0.02, 0, 0, 0, 0, 0.74, 1, 1));
  }

  // Chest (torso space; waist at y = 0, shoulders at 0.46).
  const chest = b.chest;
  chest.add(torsoShape(build, bulk), coat, coatSurface, at(0, 0, 0, 0, 0, 0, 0.66, 1, 1));
  switch (outfit) {
    case 'sweater':
      // Roll neck and ribbing.
      chest.add(cyl(0.07, 0.085, 0.09, 16), coat, WOOL, at(0, 0.52, 0));
      chest.add(cyl(0.148 * build + bulk, 0.142 * build + bulk, 0.05, 16, true), shade(coat, 0.9), WOOL, at(0, 0.02, 0, 0, 0, 0, 0.67, 1, 1));
      break;
    case 'field-jacket':
    case 'tunic':
    case 'work-shirt':
    case 'shirt': {
      const collar = outfit === 'work-shirt' ? '#e6dfcf' : outfit === 'shirt' ? shade(coat, 0.92) : coat;
      for (const side of [-1, 1]) chest.add(boxG(0.012, 0.06, 0.08), collar, CLOTH, at(0.06, 0.5, side * 0.05, side * -0.5, 0, -0.5));
      if (outfit === 'work-shirt') chest.add(cyl(0.06, 0.07, 0.05, 12), '#e6dfcf', CLOTH, at(0.015, 0.505, 0));
      // Placket with buttons and two chest pockets.
      chest.add(boxG(0.006, 0.4, 0.03), shade(coat, 0.9), CLOTH, at(0.125 * build + bulk, 0.26, 0));
      for (let i = 0; i < 4; i += 1) chest.add(unitSphere(6, 4), outfit === 'tunic' ? BRASS_COLOR : '#3a352c', outfit === 'tunic' ? BRASS : LEATHER, at(0.128 * build + bulk, 0.42 - i * 0.1, 0, 0, 0, 0, 0.008, 0.009, 0.009));
      for (const side of [-1, 1]) {
        chest.add(boxG(0.01, 0.08, 0.07), shade(coat, 0.96), CLOTH, at(0.12 * build + bulk, 0.31, side * 0.075));
        chest.add(boxG(0.014, 0.025, 0.074), shade(coat, 0.85), CLOTH, at(0.122 * build + bulk, 0.35, side * 0.075));
      }
      break;
    }
    case 'trench-coat': {
      // Wide lapels, double-breasted buttons, shoulder yoke.
      for (const side of [-1, 1]) {
        chest.add(boxG(0.012, 0.18, 0.07), shade(coat, 0.95), CLOTH, at(0.12, 0.38, side * 0.05, side * -0.35, 0, -0.08));
        for (let i = 0; i < 3; i += 1) chest.add(unitSphere(6, 4), '#3c3428', LEATHER, at(0.13, 0.28 - i * 0.09, side * 0.05, 0, 0, 0, 0.009, 0.01, 0.01));
      }
      chest.add(boxG(0.03, 0.07, 0.4), shade(coat, 1.04), CLOTH, at(-0.03, 0.43, 0, 0, 0, -0.2, 1, 1, 0.9));
      chest.add(cyl(0.06, 0.08, 0.06, 12), '#2b2c30', CLOTH, at(0.02, 0.51, 0));
      break;
    }
    case 'greatcoat':
    case 'officer-coat': {
      // High collar with rust-red tabs; double row of brass buttons.
      chest.add(cyl(0.075, 0.09, 0.08, 16), coat, coatSurface, at(0.0, 0.525, 0));
      for (const side of [-1, 1]) {
        chest.add(boxG(0.012, 0.045, 0.035), look.accent ?? '#8a3b2a', CLOTH, at(0.072, 0.53, side * 0.045, 0, side * 0.6, 0));
        for (let i = 0; i < 4; i += 1) chest.add(unitSphere(6, 4), BRASS_COLOR, BRASS, at(0.132 * build + bulk, 0.4 - i * 0.11, side * 0.05, 0, 0, 0, 0.011, 0.011, 0.011));
      }
      chest.add(boxG(0.008, 0.46, 0.012), shade(coat, 0.85), coatSurface, at(0.13 * build + bulk, 0.24, 0.012));
      break;
    }
    case 'wetsuit': {
      chest.add(cyl(0.068, 0.08, 0.08, 14), coat, RUBBER, at(0, 0.52, 0));
      chest.add(boxG(0.006, 0.34, 0.014), shade(coat, 0.7), RUBBER, at(0.118 * build, 0.28, 0));
      break;
    }
  }
  if (gear.has('cross-straps')) {
    // Leather cross-straps over the chest and back (NCOs).
    for (const side of [-1, 1]) {
      chest.add(boxG(0.01, 0.6, 0.05), '#7a3e26', LEATHER, at(0.135 * build + bulk, 0.25, 0, side * 0.6, 0, 0));
      chest.add(boxG(0.01, 0.6, 0.05), '#7a3e26', LEATHER, at(-0.13 * build - bulk, 0.25, 0, side * 0.6, 0, 0));
    }
  }
  if (gear.has('suspenders')) {
    for (const side of [-1, 1]) {
      chest.add(boxG(0.008, 0.48, 0.03), '#6b5c3a', LEATHER, at(0.122 * build + bulk, 0.23, side * 0.065, side * 0.08, 0, 0));
      chest.add(boxG(0.008, 0.48, 0.03), '#6b5c3a', LEATHER, at(-0.12 * build - bulk, 0.23, side * 0.06, side * -0.08, 0, 0));
    }
  }
  if (gear.has('satchel') || gear.has('medic-bag')) {
    // Strap from one shoulder across to the opposite hip.
    const side = gear.has('medic-bag') ? 1 : -1;
    chest.add(boxG(0.008, 0.62, 0.035), LEATHER_BROWN, LEATHER, at(0.125 * build + bulk, 0.22, 0, -side * 0.62, 0, 0));
    chest.add(boxG(0.008, 0.62, 0.035), LEATHER_BROWN, LEATHER, at(-0.12 * build - bulk, 0.22, 0, side * 0.62, 0, 0));
  }
  if (gear.has('rope')) {
    // Coiled climbing rope worn bandolier-style.
    for (let i = 0; i < 3; i += 1) {
      chest.add(new THREE.TorusGeometry(0.21, 0.018, 6, 24), i === 1 ? '#a88d5c' : '#b39b6a', WOOD, at(0.004 * i, 0.27 + i * 0.012, 0.0, Math.PI / 2 - 0.75, 0, 0, 0.7, 1.1, 1));
    }
  }
  if (gear.has('binoculars')) {
    for (const side of [-1, 1]) chest.add(cyl(0.022, 0.022, 0.09, 10), '#232523', METAL, at(0.155, 0.3, side * 0.026, 0, 0, Math.PI / 2));
    chest.add(boxG(0.03, 0.03, 0.03), '#232523', METAL, at(0.15, 0.3, 0));
    chest.add(new THREE.TorusGeometry(0.11, 0.004, 4, 16, Math.PI), DARK_LEATHER, LEATHER, at(0.13, 0.33, 0, 0, Math.PI / 2, Math.PI));
  }
  const pack = look.packColor ?? '#5a5338';
  if (gear.has('large-pack')) {
    chest.add(boxG(0.18, 0.36, 0.3), pack, CLOTH, at(-0.21, 0.27, 0));
    chest.add(boxG(0.05, 0.16, 0.24), shade(pack, 0.9), CLOTH, at(-0.31, 0.22, 0));
    for (const side of [-1, 1]) chest.add(boxG(0.1, 0.12, 0.06), shade(pack, 0.95), CLOTH, at(-0.21, 0.18, side * 0.18));
    for (const side of [-1, 1]) chest.add(boxG(0.03, 0.4, 0.035), LEATHER_BROWN, LEATHER, at(0.1, 0.25, side * 0.09, 0, 0, 0.05));
  }
  if (gear.has('small-pack')) {
    chest.add(boxG(0.13, 0.26, 0.24), pack, CLOTH, at(-0.18, 0.28, 0));
    chest.add(boxG(0.135, 0.06, 0.244), shade(pack, 0.85), CLOTH, at(-0.18, 0.37, 0));
  }
  if (gear.has('bedroll')) chest.add(cyl(0.07, 0.07, 0.44, 12), '#706a52', WOOL, at(-0.2, 0.5, 0, Math.PI / 2, 0, 0));
  if (gear.has('tools')) {
    chest.add(cyl(0.014, 0.014, 0.42, 8), '#5a4632', WOOD, at(-0.27, 0.42, 0.12, 0.2, 0, 0.25));
    chest.add(boxG(0.03, 0.03, 0.14), '#3d4044', METAL, at(-0.33, 0.62, 0.15, 0.2, 0, 0.25));
    chest.add(cyl(0.012, 0.012, 0.3, 8), '#2f3236', METAL, at(-0.25, 0.4, -0.13, -0.25, 0, 0.15));
  }
  if (gear.has('dinghy')) {
    chest.add(new THREE.CapsuleGeometry(0.17, 0.42, 6, 14), '#4b5a3c', RUBBER, at(-0.25, 0.3, 0, 0, 0, 0.12, 0.8, 1, 1));
    chest.add(new THREE.TorusGeometry(0.15, 0.016, 6, 20), '#b39b6a', WOOD, at(-0.12, 0.3, 0.17, 0, 0, 0));
  }
  if (gear.has('fins')) {
    for (const side of [-1, 1]) chest.add(boxG(0.02, 0.36, 0.11), '#1b1f24', RUBBER, at(-0.36, 0.22, side * 0.07, 0, 0, 0.08));
  }
  if (gear.has('cape')) {
    const cape = new THREE.LatheGeometry([new THREE.Vector2(0.09, 0.53), new THREE.Vector2(0.22, 0.42), new THREE.Vector2(0.3, 0.2), new THREE.Vector2(0.31, 0.18)], 20);
    chest.add(cape, coat, coatSurface, at(0, 0, 0, 0, 0, 0, 0.82, 1, 1));
  }

  // Head (head space; neck joint at y = 0).
  buildHead(b.head, look);
  buildHeadgear(b.head, look);

  // Arms: upper arm from the shoulder, forearm and hand from the elbow.
  const sleeve = outfit === 'work-shirt' ? '#5f6872' : coat;
  const glove = gear.has('gloves') ? '#1c1f22' : look.skin;
  for (const [i, side] of [-1, 1].entries()) {
    const upper = b.upper[i]!;
    upper.add(limb(0.29, 0.058 * build + bulk * 0.6, 0.048 * build + bulk * 0.5, 1.1), sleeve, coatSurface);
    if (gear.has('armband') && side === 1) {
      const band = 0.064 * build * 1.1 + bulk * 0.6 + 0.006;
      upper.add(cyl(band, band, 0.075, 16), '#ece6d6', CLOTH, at(0, -0.1, 0));
      upper.add(boxG(0.046, 0.014, 0.012), '#2e7d4f', CLOTH, at(0, -0.1, band));
      upper.add(boxG(0.014, 0.046, 0.012), '#2e7d4f', CLOTH, at(0, -0.1, band));
    }
    if (outfit === 'greatcoat' || outfit === 'officer-coat') upper.add(boxG(0.03, 0.012, 0.09), coat, coatSurface, at(0, 0.02, 0));
    const fore = b.fore[i]!;
    const rolled = outfit === 'work-shirt';
    fore.add(limb(0.24, 0.048 * build + bulk * 0.5, 0.037 * build + bulk * 0.3, 1.04), rolled ? look.skin : sleeve, rolled ? SKIN : coatSurface);
    if (rolled) fore.add(cyl(0.056, 0.054, 0.05, 12), sleeve, CLOTH, at(0, -0.02, 0));
    else fore.add(cyl(0.046 * build + bulk * 0.4, 0.048 * build + bulk * 0.4, 0.045, 12), shade(sleeve, heavy ? 0.85 : 0.92), coatSurface, at(0, -0.22, 0));
    // Hand: palm, fingers and thumb, slightly cupped.
    fore.add(unitSphere(10, 8), glove, gear.has('gloves') ? RUBBER : SKIN, at(0.004, -0.295, 0, 0, 0, 0, 0.04, 0.05, 0.024));
    fore.add(unitSphere(10, 6), glove, gear.has('gloves') ? RUBBER : SKIN, at(0.016, -0.345, 0, 0, 0, 0.35, 0.034, 0.032, 0.021));
    fore.add(new THREE.CapsuleGeometry(0.012, 0.035, 3, 6), glove, gear.has('gloves') ? RUBBER : SKIN, at(0.035, -0.285, side * 0.026, side * 0.3, 0, 0.6));
  }

  // Legs: thigh from the hip joint, shin and boot from the knee.
  const bootColor = look.bootColor ?? '#2b241e';
  for (const [i, side] of [-1, 1].entries()) {
    const thigh = b.thigh[i]!;
    const baggy = heavy || outfit === 'tunic' ? 1.12 : outfit === 'wetsuit' ? 0.92 : 1.02;
    thigh.add(limb(0.43, 0.085 * build * baggy, 0.062 * build * baggy, 1.06), trousers, trouserSurface);
    if (outfit === 'work-shirt' || outfit === 'field-jacket') thigh.add(boxG(0.03, 0.09, 0.07), shade(trousers, 0.92), CLOTH, at(0, -0.22, side * 0.075));
    const shin = b.shin[i]!;
    shin.add(limb(0.4, 0.062 * build * baggy, 0.045 * build, 1.03), trousers, trouserSurface);
    switch (look.boots) {
      case 'tall':
        shin.add(cyl(0.056, 0.05, 0.36, 14), '#111214', LEATHER, at(0, -0.22, 0));
        break;
      case 'puttees':
        for (let k = 0; k < 6; k += 1) shin.add(cyl(0.053 - k * 0.0012, 0.054 - k * 0.0012, 0.032, 12), k % 2 ? '#5d6157' : '#676b60', CLOTH, at(0, -0.36 + k * 0.035, 0, 0, 0, (k % 2 ? 1 : -1) * 0.12));
        break;
      case 'heels':
        break;
      case 'wetsuit':
        shin.add(cyl(0.05, 0.05, 0.1, 12), '#141719', RUBBER, at(0, -0.38, 0));
        break;
      default:
        shin.add(cyl(0.05, 0.052, 0.13, 14), bootColor, LEATHER, at(0, -0.37, 0));
        for (let k = 0; k < 3; k += 1) shin.add(boxG(0.004, 0.004, 0.04), '#1a1612', LEATHER, at(0.051, -0.34 - k * 0.03, 0));
    }
    // Foot: shaped boot with toe cap, heel and sole.
    const footColor = look.boots === 'heels' ? '#1d1c1e' : look.boots === 'wetsuit' ? '#141719' : look.boots === 'tall' ? '#111214' : bootColor;
    const footSurf = look.boots === 'wetsuit' ? RUBBER : LEATHER;
    const len = look.boots === 'heels' ? 0.19 : 0.24;
    shin.add(boxG(len, 0.065, 0.088), footColor, footSurf, at(0.045, -0.445, 0));
    shin.add(unitSphere(10, 6), footColor, footSurf, at(0.045 + len / 2 - 0.01, -0.45, 0, 0, 0, 0, 0.045, 0.034, 0.045));
    if (look.boots === 'heels') shin.add(boxG(0.025, 0.05, 0.03), footColor, footSurf, at(-0.04, -0.47, 0));
    else shin.add(boxG(len + 0.02, 0.018, 0.096), '#17130f', RUBBER, at(0.05, -0.483, 0));
  }
  return b;
}

// ── Weapons and lantern ───────────────────────────────────────────────────────────────────────

function buildWeapon(kind: NonNullable<FigureLook['weapon']>): THREE.Object3D | null {
  if (kind === 'none') return null;
  const p = new Parts();
  if (kind === 'harpoon') {
    p.add(cyl(0.022, 0.022, 0.5, 10), '#2b2e31', METAL, at(0.1, 0, 0, 0, 0, Math.PI / 2));
    p.add(boxG(0.18, 0.05, 0.04), '#4a3a2a', WOOD, at(-0.22, -0.01, 0));
    p.add(cyl(0.008, 0.008, 0.62, 6), '#9aa0a6', METAL, at(0.2, 0.03, 0, 0, 0, Math.PI / 2));
    p.add(new THREE.ConeGeometry(0.018, 0.07, 6), '#c0c4c8', METAL, at(0.53, 0.03, 0, 0, 0, -Math.PI / 2));
  } else {
    const long = kind === 'scoped-rifle';
    // Bolt-action rifle: stock, wrist, receiver, barrel with bands, bolt and sling.
    p.add(boxG(0.3, 0.065, 0.04), '#5a3e28', WOOD, at(-0.32, -0.015, 0, 0, 0, 0.06));
    p.add(boxG(0.42, 0.04, 0.034), '#5a3e28', WOOD, at(0.02, 0.0, 0));
    p.add(boxG(0.16, 0.035, 0.03), '#2c2e30', METAL, at(-0.08, 0.03, 0));
    p.add(cyl(0.011, 0.011, long ? 0.62 : 0.5, 8), '#2c2e30', METAL, at(long ? 0.4 : 0.34, 0.025, 0, 0, 0, Math.PI / 2));
    for (const x of [0.06, 0.22]) p.add(cyl(0.022, 0.022, 0.016, 8), '#2c2e30', METAL, at(x, 0.01, 0, 0, 0, Math.PI / 2));
    p.add(cyl(0.006, 0.006, 0.05, 6), '#2c2e30', METAL, at(-0.1, 0.035, 0.03, Math.PI / 2, 0, 0));
    p.add(unitSphere(6, 4), '#2c2e30', METAL, at(-0.1, 0.035, 0.058, 0, 0, 0, 0.012, 0.012, 0.012));
    p.add(boxG(0.6, 0.008, 0.012), LEATHER_BROWN, LEATHER, at(-0.06, -0.06, 0, 0, 0, 0.12));
    if (long) {
      p.add(cyl(0.017, 0.017, 0.22, 10), '#1c1e20', METAL, at(-0.06, 0.075, 0, 0, 0, Math.PI / 2));
      for (const x of [-0.17, 0.05]) p.add(cyl(0.024, 0.02, 0.04, 10), '#1c1e20', METAL, at(x, 0.075, 0, 0, 0, Math.PI / 2));
    }
  }
  const mesh = segmentMesh(p);
  return mesh;
}

function buildLantern(): THREE.Object3D {
  const p = new Parts();
  p.add(cyl(0.045, 0.05, 0.02, 10), '#2a2c2e', METAL, at(0, 0.06, 0));
  p.add(cyl(0.05, 0.05, 0.02, 10), '#2a2c2e', METAL, at(0, -0.06, 0));
  for (let k = 0; k < 4; k += 1) p.add(boxG(0.006, 0.12, 0.006), '#2a2c2e', METAL, at(Math.cos((k * Math.PI) / 2) * 0.042, 0, Math.sin((k * Math.PI) / 2) * 0.042));
  p.add(new THREE.TorusGeometry(0.03, 0.004, 4, 12, Math.PI), '#2a2c2e', METAL, at(0, 0.085, 0, 0, 0, 0));
  const frame = segmentMesh(p)!;
  const glass = new THREE.Mesh(cyl(0.038, 0.038, 0.1, 10), material('#ffd690', { emissive: '#ffb850', emissiveIntensity: 3 }));
  frame.add(glass);
  frame.add(glowSprite(1.1, '#ffbf70', 0.8));
  return frame;
}

// ── Assembly ──────────────────────────────────────────────────────────────────────────────────

function attach(parent: THREE.Object3D, parts: Parts): THREE.Mesh | null {
  const mesh = segmentMesh(parts);
  if (mesh) parent.add(mesh);
  return mesh;
}

/** Builds an articulated figure facing +x with its feet at the origin (about 1.78 m tall). */
export function createFigure(look: FigureLook): FigureRig {
  const built = buildBody(look);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(look.height ?? 1);
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  attach(hips, built.pelvis);
  const skirt = attach(hips, built.skirt);

  const torso = new THREE.Group();
  torso.position.y = 0.07;
  hips.add(torso);
  const chest = attach(torso, built.chest) ?? new THREE.Object3D();

  const head = new THREE.Group();
  head.position.y = 0.56;
  torso.add(head);
  attach(head, built.head);

  const build = look.build ?? 1;
  const makeArm = (i: 0 | 1, side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(-0.005, 0.44, side * (0.168 * build + bulkOf(look)));
    torso.add(shoulder);
    attach(shoulder, built.upper[i]);
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    attach(elbow, built.fore[i]);
    return { shoulder, elbow };
  };
  const left = makeArm(0, -1);
  const right = makeArm(1, 1);

  const makeLeg = (i: 0 | 1, side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(0, -0.035, side * 0.088 * build);
    hips.add(hip);
    attach(hip, built.thigh[i]);
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    hip.add(knee);
    attach(knee, built.shin[i]);
    return { hip, knee };
  };
  const legL = makeLeg(0, -1);
  const legR = makeLeg(1, 1);

  const weapon = buildWeapon(look.weapon ?? 'none');
  if (weapon) torso.add(weapon);

  let lanternLight: THREE.Object3D | null = null;
  if (look.lantern) {
    const lantern = buildLantern();
    lantern.position.set(0.03, -0.4, 0);
    left.elbow.add(lantern);
    lanternLight = lantern;
  }

  const rig: FigureRig = {
    root,
    hips,
    torso,
    head,
    armL: left.shoulder,
    armR: right.shoulder,
    elbowL: left.elbow,
    elbowR: right.elbow,
    legL: legL.hip,
    legR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
    chest,
    skirt,
    weapon,
    lanternLight,
    phase: 0,
  };
  return rig;
}

// ── Animation ─────────────────────────────────────────────────────────────────────────────────

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Joints {
  hipsY: number;
  hipsRotZ: number;
  hipsRotX: number;
  torsoZ: number;
  torsoY: number;
  headZ: number;
  thighL: number;
  thighR: number;
  kneeL: number;
  kneeR: number;
  armL: number;
  armR: number;
  elbowL: number;
  elbowR: number;
  spread: number;
}

/** Applies a pose; `dt` advances the gait cycle. Joints blend smoothly between poses. */
export function poseFigure(rig: FigureRig, pose: FigurePose, dt: number, time: number): void {
  const blend = Math.min(1, dt * 12);
  const speed = pose.running ? 10.5 : pose.stance === 'prone' ? 4.5 : pose.stance === 'crouch' ? 6.5 : 7.2;
  if (pose.moving || pose.climbing || pose.swimming) rig.phase += dt * speed;
  const s = Math.sin(rig.phase);
  const c = Math.cos(rig.phase);
  // Knees bend while the leg swings forward (thigh velocity positive).
  const swingL = Math.max(0, c);
  const swingR = Math.max(0, -c);
  const breathe = Math.sin(time * 1.9);

  const j: Joints = { hipsY: 0.95, hipsRotZ: 0, hipsRotX: 0, torsoZ: 0, torsoY: 0, headZ: 0, thighL: 0, thighR: 0, kneeL: -0.05, kneeR: -0.05, armL: 0, armR: 0, elbowL: 0.18, elbowR: 0.18, spread: 0.06 };

  if (pose.carried) {
    j.hipsY = 1.45;
    j.hipsRotZ = -Math.PI / 2;
    j.armL = 0.6;
    j.armR = 0.4;
    j.elbowL = 0.4;
    j.elbowR = 0.6;
    j.thighL = 0.3;
    j.thighR = 0.1;
    j.kneeL = -0.7;
    j.kneeR = -0.4;
    j.headZ = 0.4;
  } else if (pose.lying !== 'none') {
    j.hipsY = 0.14;
    j.hipsRotZ = Math.PI / 2;
    if (pose.lying === 'side') j.hipsRotX = Math.PI / 2.4;
    j.spread = 0.55;
    j.thighL = 0.25;
    j.thighR = -0.05;
    j.kneeL = -0.5;
    j.kneeR = -0.15;
    j.elbowL = 0.5;
    j.elbowR = 0.2;
    j.headZ = 0.25;
  } else if (pose.swimming) {
    j.hipsY = -0.75;
    j.hipsRotZ = -1.3;
    j.armL = 2.5 + s * 1.1;
    j.armR = 2.5 - s * 1.1;
    j.elbowL = 0.3 + swingL * 0.5;
    j.elbowR = 0.3 + swingR * 0.5;
    j.thighL = s * 0.35;
    j.thighR = -s * 0.35;
    j.kneeL = -0.2 - swingL * 0.4;
    j.kneeR = -0.2 - swingR * 0.4;
    j.headZ = 0.9;
  } else if (pose.stance === 'prone') {
    j.hipsY = 0.17;
    j.hipsRotZ = -Math.PI / 2;
    const crawl = pose.moving ? 0.4 : 0;
    j.armL = 2.5 + s * crawl;
    j.armR = 2.5 - s * crawl;
    j.elbowL = 0.9 + swingL * crawl;
    j.elbowR = 0.9 + swingR * crawl;
    j.thighL = -0.1 + s * crawl * 0.7;
    j.thighR = -0.1 - s * crawl * 0.7;
    j.kneeL = -0.2 - swingL * crawl * 1.5;
    j.kneeR = -0.2 - swingR * crawl * 1.5;
    j.headZ = 1.1;
    j.spread = 0.25;
  } else if (pose.climbing) {
    j.armL = 2.7 + s * 0.35;
    j.armR = 2.7 - s * 0.35;
    j.elbowL = 0.4 + swingL * 0.6;
    j.elbowR = 0.4 + swingR * 0.6;
    j.thighL = 0.7 + s * 0.45;
    j.thighR = 0.7 - s * 0.45;
    j.kneeL = -1.2 + s * 0.4;
    j.kneeR = -1.2 - s * 0.4;
    j.headZ = 0.2;
  } else {
    const crouch = pose.stance === 'crouch';
    const run = pose.running && !crouch;
    const amp = pose.moving ? (run ? 0.85 : crouch ? 0.42 : 0.5) : 0;
    j.hipsY = crouch ? 0.64 : 0.95 - (pose.moving ? Math.abs(c) * (run ? 0.04 : 0.022) : 0) + (run ? -0.03 : 0);
    j.torsoZ = crouch ? -0.42 : run ? -0.22 : -0.02;
    j.torsoY = pose.moving ? s * (run ? 0.14 : 0.08) : 0;
    j.thighL = (crouch ? 1.05 : 0) + s * amp;
    j.thighR = (crouch ? 1.05 : 0) - s * amp;
    j.kneeL = (crouch ? -1.55 : -0.06) - swingL * amp * (run ? 1.9 : 1.25);
    j.kneeR = (crouch ? -1.55 : -0.06) - swingR * amp * (run ? 1.9 : 1.25);
    j.armL = -s * amp * 0.8;
    j.armR = s * amp * 0.8;
    j.elbowL = (run ? 1.35 : 0.2) + Math.max(0, -s) * amp * 0.5;
    j.elbowR = (run ? 1.35 : 0.2) + Math.max(0, s) * amp * 0.5;
    j.headZ = crouch ? 0.3 : run ? 0.15 : 0;
    if (pose.carrying) {
      j.armL = 2.6;
      j.armR = 2.3;
      j.elbowL = 0.9;
      j.elbowR = 1.2;
    } else if (pose.aiming) {
      // Rifle shouldered: right hand at the grip, left supporting the fore-end.
      j.armR = 1.05;
      j.elbowR = 1.35;
      j.armL = 1.25;
      j.elbowL = 0.55;
      j.headZ = 0.12;
    } else if (pose.talking) {
      j.armR = 0.7 + Math.sin(time * 4.2) * 0.3;
      j.elbowR = 1.1 + Math.sin(time * 3.1) * 0.25;
    } else if (!pose.moving) {
      // Idle: breathing and a slight weight shift.
      j.armL = 0.04 + breathe * 0.02;
      j.armR = 0.04 - breathe * 0.02;
      j.torsoZ += breathe * 0.012;
    }
  }

  rig.hips.position.y = lerp(rig.hips.position.y, j.hipsY, blend);
  rig.hips.rotation.z = lerp(rig.hips.rotation.z, j.hipsRotZ, blend);
  rig.hips.rotation.x = lerp(rig.hips.rotation.x, j.hipsRotX, blend);
  rig.torso.rotation.z = lerp(rig.torso.rotation.z, j.torsoZ, blend);
  rig.torso.rotation.y = lerp(rig.torso.rotation.y, j.torsoY, blend);
  rig.head.rotation.z = lerp(rig.head.rotation.z, j.headZ, blend);
  rig.legL.rotation.z = lerp(rig.legL.rotation.z, j.thighL, blend);
  rig.legR.rotation.z = lerp(rig.legR.rotation.z, j.thighR, blend);
  rig.kneeL.rotation.z = lerp(rig.kneeL.rotation.z, j.kneeL, blend);
  rig.kneeR.rotation.z = lerp(rig.kneeR.rotation.z, j.kneeR, blend);
  rig.armL.rotation.z = lerp(rig.armL.rotation.z, j.armL, blend);
  rig.armR.rotation.z = lerp(rig.armR.rotation.z, j.armR, blend);
  rig.elbowL.rotation.z = lerp(rig.elbowL.rotation.z, j.elbowL, blend);
  rig.elbowR.rotation.z = lerp(rig.elbowR.rotation.z, j.elbowR, blend);
  rig.armL.rotation.x = lerp(rig.armL.rotation.x, -j.spread, blend);
  rig.armR.rotation.x = lerp(rig.armR.rotation.x, j.spread, blend);
  rig.chest.scale.y = 1 + (pose.moving ? 0 : breathe * 0.006);
  if (rig.skirt) {
    // The skirt drapes over the thighs: shorter and tilted forward when the legs come up.
    const lift = Math.max(0, (rig.legL.rotation.z + rig.legR.rotation.z) / 2);
    rig.skirt.rotation.z = lift * 0.75;
    rig.skirt.scale.y = 1 - Math.min(0.5, lift * 0.42);
    rig.skirt.scale.x = 1 + Math.min(0.35, lift * 0.3);
  }
  if (rig.weapon) {
    // Slung diagonally on the back, or shouldered when aiming.
    const aimed = pose.aiming && pose.lying === 'none' && !pose.carried && pose.stance !== 'prone';
    rig.weapon.position.set(aimed ? 0.26 : -0.15, aimed ? 0.41 : 0.27, aimed ? 0.11 : 0.02);
    rig.weapon.rotation.set(0, 0, aimed ? 0 : 1.2);
  }
}
