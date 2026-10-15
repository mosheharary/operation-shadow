'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '@operation-shadow/engine';
import { PerfProbe, type RenderSample } from './perf-probe';

const SEED = 20261015;
const SIZE = 160;
const SEGMENTS = 128;

/** Smooth value noise built from the engine's deterministic RNG (same seed, same terrain). */
function createValueNoise(seed: number, cells: number) {
  const rng = Rng.fromSeed(seed);
  const grid = Array.from({ length: (cells + 1) * (cells + 1) }, () => rng.next());
  const at = (x: number, y: number) => grid[y * (cells + 1) + x] ?? 0;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => {
    const x = Math.min(u * cells, cells - 1e-6);
    const y = Math.min(v * cells, cells - 1e-6);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

function buildTerrain(): THREE.BufferGeometry {
  const octaves = [createValueNoise(SEED, 6), createValueNoise(SEED + 1, 14), createValueNoise(SEED + 2, 32)];
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const grass = new THREE.Color('#4f5e3a');
  const dirt = new THREE.Color('#6b5a43');
  const rock = new THREE.Color('#77786f');
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) / SIZE + 0.5;
    const v = position.getZ(i) / SIZE + 0.5;
    const height = (octaves[0]!(u, v) * 1 + octaves[1]!(u, v) * 0.35 + octaves[2]!(u, v) * 0.12) * 7 - 3;
    // Keep the central compound area flat enough for buildings.
    const centre = Math.hypot(u - 0.5, v - 0.5);
    const flatten = THREE.MathUtils.smoothstep(centre, 0.12, 0.3);
    position.setY(i, height * flatten);
    const t = THREE.MathUtils.clamp((height * flatten + 1.5) / 6, 0, 1);
    color.copy(grass).lerp(dirt, Math.min(1, t * 1.4));
    if (t > 0.75) color.lerp(rock, (t - 0.75) * 4);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function Barracks({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow position={[0, 1.6, 0]}>
        <boxGeometry args={[12, 3.2, 6]} />
        <meshStandardMaterial color="#5d5345" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 3.9, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 1]}>
        {/* A three-sided cylinder makes a gable roof. */}
        <cylinderGeometry args={[2.2, 2.2, 12.6, 3, 1]} />
        <meshStandardMaterial color="#3d3a36" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Watchtower({ position }: { position: [number, number, number] }) {
  const legs: [number, number][] = [
    [-1.2, -1.2],
    [1.2, -1.2],
    [-1.2, 1.2],
    [1.2, 1.2],
  ];
  return (
    <group position={position}>
      {legs.map(([x, z]) => (
        <mesh key={`${x}:${z}`} castShadow position={[x, 3, z]}>
          <boxGeometry args={[0.25, 6, 0.25]} />
          <meshStandardMaterial color="#4a3c2c" />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 6.2, 0]}>
        <boxGeometry args={[3.4, 0.3, 3.4]} />
        <meshStandardMaterial color="#5a4a36" />
      </mesh>
      <mesh castShadow position={[0, 8, 0]}>
        <coneGeometry args={[2.6, 1.6, 4]} />
        <meshStandardMaterial color="#3a352f" />
      </mesh>
    </group>
  );
}

function Forest({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rng = Rng.fromSeed(SEED + 99);
    const dummy = new THREE.Object3D();
    let placed = 0;
    while (placed < count) {
      const x = rng.range(-SIZE / 2 + 5, SIZE / 2 - 5);
      const z = rng.range(-SIZE / 2 + 5, SIZE / 2 - 5);
      if (Math.hypot(x, z) < 34) continue; // keep the compound clear
      const scale = rng.range(0.8, 1.6);
      dummy.position.set(x, 2.5 * scale, z);
      dummy.scale.setScalar(scale);
      dummy.rotation.y = rng.range(0, Math.PI * 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
      <coneGeometry args={[1.6, 5, 7]} />
      <meshStandardMaterial color="#2f4030" roughness={0.95} />
    </instancedMesh>
  );
}

export function TestRangeScene({ onSample }: { onSample: (sample: RenderSample) => void }) {
  const terrain = useMemo(() => buildTerrain(), []);

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [70, 60, 70], fov: 35, near: 0.5, far: 600 }}>
      <color attach="background" args={['#1b242c']} />
      <fog attach="fog" args={['#1b242c', 90, 260]} />
      <hemisphereLight args={['#c4ccd4', '#3a3426', 0.7]} />
      <directionalLight
        castShadow
        position={[60, 90, 35]}
        intensity={2.4}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-bias={-0.0004}
      />
      <mesh geometry={terrain} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <Barracks position={[-10, 0, -6]} />
      <Barracks position={[12, 0, 4]} rotation={Math.PI / 2} />
      <Watchtower position={[-22, 0, 16]} />
      <Watchtower position={[20, 0, -20]} />
      <Forest count={260} />
      <OrbitControls
        target={[0, 0, 0]}
        enableDamping
        minDistance={25}
        maxDistance={180}
        maxPolarAngle={Math.PI / 2.6}
      />
      <PerfProbe onSample={onSample} />
    </Canvas>
  );
}
