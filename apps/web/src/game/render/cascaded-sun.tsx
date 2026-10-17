'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

/** Where the sun shines from, relative to what it lights (the same as the single shadow light). */
const SUN_OFFSET = new THREE.Vector3(30, 55, -34);

interface Patched {
  onBeforeCompile: THREE.Material['onBeforeCompile'];
  cacheKey: THREE.Material['customProgramCacheKey'];
}

const isLit = (m: THREE.Material): boolean =>
  (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial === true || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial === true;

/**
 * Cascaded shadow maps for the sun (rich environment): three 2048 px cascades out to 140 m, so
 * shadows are sharp at the feet of the squad and still present across a zoomed-out map. CSM
 * brings its own directional lights; every lit material must be set up for them, so the scene
 * is scanned for new materials (models load later), and their own shader patches are kept by
 * chaining CSM's after them. Removing the component restores the materials.
 */
export function CascadedSun({ color, intensity }: { color: THREE.Color; intensity: number }) {
  const { scene, camera } = useThree();
  // Created in an effect, not a memo: the constructor adds lights to the scene, and an effect's
  // cleanup is the only place that reliably takes them away again (React may run render twice).
  const csmRef = useRef<CSM | null>(null);
  const patched = useMemo(() => new Map<THREE.Material, Patched>(), []);

  useEffect(() => {
    const csm = new CSM({
      camera,
      parent: scene,
      cascades: 3,
      maxFar: 140,
      mode: 'practical',
      shadowMapSize: 2048,
      lightDirection: SUN_OFFSET.clone().negate().normalize(),
      lightIntensity: 1,
      lightNear: 1,
      lightFar: 400,
      lightMargin: 60,
    });
    csmRef.current = csm;
    for (const light of csm.lights) {
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.03;
    }
    return () => {
      csmRef.current = null;
      csm.remove();
      csm.dispose();
      for (const [material, original] of patched) {
        material.onBeforeCompile = original.onBeforeCompile;
        material.customProgramCacheKey = original.cacheKey;
        if (material.defines) {
          delete material.defines.USE_CSM;
          delete material.defines.CSM_CASCADES;
          delete material.defines.CSM_FADE;
        }
        material.needsUpdate = true;
      }
      patched.clear();
    };
  }, [scene, camera, patched]);

  const setup = (csm: CSM, material: THREE.Material) => {
    if (patched.has(material) || !isLit(material)) return;
    const original: Patched = { onBeforeCompile: material.onBeforeCompile, cacheKey: material.customProgramCacheKey };
    patched.set(material, original);
    csm.setupMaterial(material);
    const csmHook = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      original.onBeforeCompile.call(material, shader, renderer);
      csmHook.call(material, shader, renderer);
    };
    material.customProgramCacheKey = () => `${original.cacheKey.call(material)}|csm`;
    material.needsUpdate = true;
  };

  const state = useRef({ frame: 0, near: -1, aspect: -1 });
  useFrame(() => {
    const csm = csmRef.current;
    if (!csm) return;
    const s = state.current;
    // New materials appear as models load and rigs are built: scan for them a few times a second.
    if (s.frame++ % 15 === 0) {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) setup(csm, material);
      });
    }
    const perspective = camera as THREE.PerspectiveCamera;
    if (perspective.near !== s.near || perspective.aspect !== s.aspect) {
      s.near = perspective.near;
      s.aspect = perspective.aspect;
      csm.updateFrustums();
    }
    for (const light of csm.lights) {
      light.color.copy(color);
      light.intensity = intensity;
    }
    csm.update();
  });
  return null;
}
