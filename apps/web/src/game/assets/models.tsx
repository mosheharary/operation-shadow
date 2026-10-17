'use client';

import { useGLTF } from '@react-three/drei';
import { useEffect } from 'react';
import type * as THREE from 'three';
import { type ModelId, modelUrl } from './registry';
import { useAssetStatus } from './status';

export { AssetBoundary } from './boundary';

// Models carry plain float geometry and WebP textures: no Draco or meshopt decoder (and no
// WebAssembly) is needed, so the content security policy stays as it is.
const DRACO = false;
const MESHOPT = false;

/** Loads a processed model (suspends until it is ready; shared and cached per URL). */
export function useModel(id: ModelId): THREE.Group {
  return useModelFile(id).scene;
}

/** Like `useModel`, with the file's animation clips. */
export function useModelFile(id: ModelId): { scene: THREE.Group; animations: THREE.AnimationClip[] } {
  const gltf = useGLTF(modelUrl(id), DRACO, MESHOPT);
  useEffect(() => useAssetStatus.getState().markLoaded(id), [id]);
  return gltf;
}

/** Starts downloading models before they are first rendered. */
export function preloadModels(ids: ModelId[]): void {
  for (const id of ids) useGLTF.preload(modelUrl(id), DRACO, MESHOPT);
}
