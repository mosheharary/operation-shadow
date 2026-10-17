import * as THREE from 'three';

/** CC0 surface sets fetched by `make textures` (see apps/web/public/media/textures/manifest.json). */
export type SurfaceKey =
  | 'cobble'
  | 'rock'
  | 'grass'
  | 'forest'
  | 'sand'
  | 'gravel'
  | 'planks'
  | 'planks-light'
  | 'plaster'
  | 'stone-wall'
  | 'roof-slate'
  | 'roof-clay'
  | 'concrete'
  | 'metal'
  | 'snow'
  | 'hessian'
  | 'concrete-cast'
  | 'corrugated'
  | 'bark-pine'
  | 'bark-oak';

export type MapKind = 'color' | 'normal' | 'rough';

const BASE = '/media/textures';
export const TEXTURE_SIZE = 512;

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

let highRes = false;
/**
 * Colour maps at 1024 px (rich environment) instead of 512. Set before the scene builds its
 * materials; materials and textures are cached per tier.
 */
export function setHighResTextures(on: boolean): void {
  highRes = on;
}
export const highResTextures = (): boolean => highRes;

/** A repeating surface map, loaded on first use (sRGB for colour, linear for data maps). */
export function surfaceTexture(key: SurfaceKey, map: MapKind): THREE.Texture {
  const file = map === 'color' && highRes ? 'color-1k' : map;
  const id = `${key}/${file}`;
  let texture = cache.get(id);
  if (!texture) {
    texture = loader.load(`${BASE}/${key}/${file}.webp`);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    texture.colorSpace = map === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    cache.set(id, texture);
  }
  return texture;
}

async function pixels(url: string, size = TEXTURE_SIZE): Promise<Uint8ClampedArray> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  return ctx.getImageData(0, 0, size, size).data;
}

function arrayTexture(layers: number, fill: [number, number, number, number], srgb: boolean, edge = TEXTURE_SIZE): THREE.DataArrayTexture {
  const size = edge * edge * 4;
  const data = new Uint8Array(size * layers);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  const texture = new THREE.DataArrayTexture(data, edge, edge, layers);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface SurfaceArrays {
  /** Albedo layers (sRGB). */
  color: THREE.DataArrayTexture;
  /** Tangent-space normal in RGB, roughness in A. */
  normalRough: THREE.DataArrayTexture;
  ready: Promise<void>;
}

/**
 * Packs several surface sets into two array textures so the terrain shader blends many materials
 * with only two samplers. Starts neutral and fills in as the images arrive.
 */
export function surfaceArrays(keys: readonly SurfaceKey[], highResColor = false): SurfaceArrays {
  const colorEdge = highResColor ? TEXTURE_SIZE * 2 : TEXTURE_SIZE;
  const color = arrayTexture(keys.length, [128, 128, 128, 255], true, colorEdge);
  const normalRough = arrayTexture(keys.length, [128, 128, 255, 220], false);
  const layerBytes = TEXTURE_SIZE * TEXTURE_SIZE * 4;
  const colorBytes = colorEdge * colorEdge * 4;
  const ready = Promise.all(
    keys.map(async (key, layer) => {
      const [c, n, r] = await Promise.all([
        pixels(`${BASE}/${key}/${highResColor ? 'color-1k' : 'color'}.webp`, colorEdge),
        pixels(`${BASE}/${key}/normal.webp`),
        pixels(`${BASE}/${key}/rough.webp`),
      ]);
      (color.image.data as Uint8Array).set(c, layer * colorBytes);
      const out = normalRough.image.data as Uint8Array;
      for (let i = 0; i < layerBytes; i += 4) {
        out[layer * layerBytes + i] = n[i]!;
        out[layer * layerBytes + i + 1] = n[i + 1]!;
        out[layer * layerBytes + i + 2] = n[i + 2]!;
        out[layer * layerBytes + i + 3] = r[i]!;
      }
    }),
  ).then(() => {
    color.needsUpdate = true;
    normalRough.needsUpdate = true;
  });
  return { color, normalRough, ready };
}
