'use client';

import type { PropKind } from '@operation-shadow/engine';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { bakeStaticParts, type Part } from '../../assets/bake';
import { AssetBoundary, useModel } from '../../assets/models';
import { AUTHORED, proceduralParts } from '../props';

const KINDS = Object.keys(AUTHORED) as PropKind[];
const SPACING = 2.6;

function PartsAt({ parts, x, z }: { parts: Part[]; x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} castShadow receiveShadow />
      ))}
    </group>
  );
}

function Authored({ kind, x }: { kind: PropKind; x: number }) {
  const spec = AUTHORED[kind]!;
  const scene = useModel(spec.id);
  const parts = useMemo(() => bakeStaticParts(scene, spec), [scene, spec]);
  return <PartsAt parts={parts} x={x} z={-1.6} />;
}

function Row() {
  return (
    <>
      {KINDS.map((kind, i) => {
        const x = (i - (KINDS.length - 1) / 2) * SPACING;
        return (
          <group key={kind}>
            <AssetBoundary id={AUTHORED[kind]!.id} fallback={null}>
              <Suspense fallback={null}>
                <Authored kind={kind} x={x} />
              </Suspense>
            </AssetBoundary>
            <ProceduralAt kind={kind} x={x} />
          </group>
        );
      })}
    </>
  );
}

function ProceduralAt({ kind, x }: { kind: PropKind; x: number }) {
  const parts = useMemo(() => proceduralParts(kind), [kind]);
  return <PartsAt parts={parts} x={x} z={1.6} />;
}

export function AssetScene() {
  return (
    <Canvas shadows camera={{ fov: 30, position: [0, 6, 16], near: 0.1, far: 200 }} dpr={[1, 2]} onCreated={({ gl }) => (gl.toneMapping = THREE.ACESFilmicToneMapping)}>
      <color attach="background" args={['#1a2026']} />
      <hemisphereLight args={['#b8c6d8', '#3a3328', 1]} />
      <directionalLight position={[6, 9, 7]} intensity={2.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={6} shadow-camera-bottom={-6} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[40, 14]} />
        <meshStandardMaterial color="#4a4a40" roughness={0.95} />
      </mesh>
      <Row />
      <OrbitControls target={[0, 0.8, 0]} maxPolarAngle={Math.PI * 0.49} />
    </Canvas>
  );
}
