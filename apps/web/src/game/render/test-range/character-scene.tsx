'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { createFigure, type FigurePose, type FigureRig, poseFigure } from '../figure';
import { DISGUISED_LOOK, guardLook, PRISONER_LOOK, SQUAD_LOOKS } from '../looks';

export type LineupPose = 'stand' | 'walk' | 'run' | 'crouch' | 'prone' | 'aim';

const LINEUP = [
  SQUAD_LOOKS.infiltrator,
  SQUAD_LOOKS.recon,
  SQUAD_LOOKS.engineer,
  SQUAD_LOOKS.deception,
  SQUAD_LOOKS.medic,
  SQUAD_LOOKS.marine,
  guardLook({ id: 'g:sentry-1', rank: 'soldier', carriesLantern: false }),
  guardLook({ id: 'g:sentry-2', rank: 'soldier', carriesLantern: true }),
  guardLook({ id: 'g:nco', rank: 'nco', carriesLantern: false }),
  guardLook({ id: 'g:officer', rank: 'officer', carriesLantern: false }),
  DISGUISED_LOOK,
  PRISONER_LOOK,
];

function poseFor(p: LineupPose): FigurePose {
  return {
    stance: p === 'crouch' ? 'crouch' : p === 'prone' ? 'prone' : 'stand',
    moving: p === 'walk' || p === 'run',
    running: p === 'run',
    lying: 'none',
    carrying: false,
    carried: false,
    aiming: p === 'aim',
    talking: false,
    swimming: false,
    climbing: false,
  };
}

function Lineup({ pose }: { pose: LineupPose }) {
  // Rigs and their group are built together: React may run this twice in development, and each
  // run must own its own objects (re-parenting shared rigs would empty the kept group).
  const { rigs, group } = useMemo(() => {
    const built: FigureRig[] = LINEUP.map((look) => createFigure(look));
    const g = new THREE.Group();
    built.forEach((rig, i) => {
      // Facing the camera (figures face +x; the camera looks along -z).
      rig.root.position.set((i - (built.length - 1) / 2) * 0.9, 0, 0);
      rig.root.rotation.y = -Math.PI / 2;
      g.add(rig.root);
    });
    return { rigs: built, group: g };
  }, []);
  const figurePose = poseFor(pose);
  useFrame((state, dt) => {
    for (const rig of rigs) poseFigure(rig, figurePose, Math.min(dt, 0.05), state.clock.elapsedTime);
  });
  return <primitive object={group} />;
}

export function CharacterScene({ pose }: { pose: LineupPose }) {
  return (
    <Canvas shadows camera={{ fov: 30, position: [0, 1.6, 9], near: 0.05, far: 100 }} dpr={[1, 2]} onCreated={({ gl }) => (gl.toneMapping = THREE.ACESFilmicToneMapping)}>
      <color attach="background" args={['#1a2026']} />
      <hemisphereLight args={['#b8c6d8', '#3a3328', 0.9]} />
      <directionalLight position={[4, 7, 6]} intensity={2.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={4} shadow-camera-bottom={-2} />
      <directionalLight position={[-5, 3, -4]} intensity={0.8} color="#9fb4d8" />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[30, 12]} />
        <meshStandardMaterial color="#4a4a40" roughness={0.95} />
      </mesh>
      <Lineup pose={pose} />
      <OrbitControls target={[0, 0.95, 0]} maxPolarAngle={Math.PI * 0.49} />
    </Canvas>
  );
}
