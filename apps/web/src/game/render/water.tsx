'use client';

import type { LevelData } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Animated sea surface reaching to the horizon: gentle vertex swell, moving glints and a sky
 * tint at grazing angles, so the sea reads as water even on a moonlit night.
 */
export function Water({ level }: { level: LevelData }) {
  const { geometry, material } = useMemo(() => {
    const margin = 420;
    const geo = new THREE.PlaneGeometry(level.width + margin * 2, level.depth + margin * 2, 160, 160);
    geo.rotateX(-Math.PI / 2);
    geo.translate(level.width / 2, level.seaLevel - 0.15, level.depth / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#2a4757', roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.9 });
    const uniforms = { uTime: { value: 0 } };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWorld;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float swell = sin(position.x * 0.18 + uTime * 0.9) * 0.08 + cos(position.z * 0.23 + uTime * 0.7) * 0.06;
          transformed.y += swell;
          vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWorld;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float ripple = sin(vWorld.x * 2.3 + uTime * 1.7 + sin(vWorld.z * 0.9) * 2.0) * sin(vWorld.z * 2.9 - uTime * 1.3 + sin(vWorld.x * 0.7) * 2.0);
          float glint = smoothstep(0.93, 1.0, ripple) * 0.6;
          float facing = abs(dot(normalize(vViewPosition), normal));
          float fresnel = pow(1.0 - facing, 3.0);
          totalEmissiveRadiance += vec3(0.16, 0.24, 0.32) * glint + vec3(0.1, 0.15, 0.22) * fresnel;`,
        );
    };
    mat.userData.uniforms = uniforms;
    return { geometry: geo, material: mat };
  }, [level]);

  useFrame((_, delta) => {
    const uniforms = material.userData.uniforms as { uTime: { value: number } };
    uniforms.uTime.value += delta;
  });

  return <mesh name="water" geometry={geometry} material={material} receiveShadow />;
}
