'use client';

import { useGLTF } from '@react-three/drei';
import { Component, type ReactNode, useEffect } from 'react';
import type * as THREE from 'three';
import { type ModelId, modelUrl } from './registry';
import { useAssetStatus } from './status';

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

/** Renders `fallback` (the procedural version) when a model fails to load. */
export class AssetBoundary extends Component<{ id: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    useAssetStatus.getState().markFailed(this.props.id, error instanceof Error ? error.message : String(error));
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
