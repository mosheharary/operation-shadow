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
  | 'corrugated';

export type MapKind = 'color' | 'normal' | 'rough';

const BASE = '/media/textures';
export const TEXTURE_SIZE = 512;

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

/** A repeating surface map, loaded on first use (sRGB for colour, linear for data maps). */
export function surfaceTexture(key: SurfaceKey, map: MapKind): THREE.Texture {
  const id = `${key}/${map}`;
  let texture = cache.get(id);
  if (!texture) {
    texture = loader.load(`${BASE}/${key}/${map}.webp`);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    texture.colorSpace = map === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    cache.set(id, texture);
  }
  return texture;
}

async function pixels(url: string): Promise<Uint8ClampedArray> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(TEXTURE_SIZE, TEXTURE_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  bitmap.close();
  return ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE).data;
}

function arrayTexture(layers: number, fill: [number, number, number, number], srgb: boolean): THREE.DataArrayTexture {
  const size = TEXTURE_SIZE * TEXTURE_SIZE * 4;
  const data = new Uint8Array(size * layers);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  const texture = new THREE.DataArrayTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, layers);
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
export function surfaceArrays(keys: readonly SurfaceKey[]): SurfaceArrays {
  const color = arrayTexture(keys.length, [128, 128, 128, 255], true);
  const normalRough = arrayTexture(keys.length, [128, 128, 255, 220], false);
  const layerBytes = TEXTURE_SIZE * TEXTURE_SIZE * 4;
  const ready = Promise.all(
    keys.map(async (key, layer) => {
      const [c, n, r] = await Promise.all([pixels(`${BASE}/${key}/color.webp`), pixels(`${BASE}/${key}/normal.webp`), pixels(`${BASE}/${key}/rough.webp`)]);
      (color.image.data as Uint8Array).set(c, layer * layerBytes);
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
