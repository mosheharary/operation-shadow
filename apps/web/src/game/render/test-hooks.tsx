'use client';

import type { AlarmLevel, OperativeStatus, Stance } from '@operation-shadow/engine';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import type { GameController } from '../runtime/controller';
import { useGameUi } from '../runtime/store';
import { rigCounts } from './rig';

export interface GameProbe {
  tick: number;
  status: 'running' | 'success' | 'failed';
  paused: boolean;
  alarm: AlarmLevel;
  selected: string[];
  /** View cones currently drawn (far and near fans count separately). */
  conesVisible: number;
  /** Characters drawn as authored (skinned glTF) and as procedural figures. */
  rigs: { authored: number; procedural: number };
  operatives: { id: string; role: string; x: number; z: number; status: OperativeStatus; stance: Stance; busy: boolean }[];
}

declare global {
  interface Window {
    /**
     * Read-only probe for browser tests: current state summary and world-to-screen projection so
     * tests drive the game with real mouse input. It cannot issue orders or change state.
     */
    __OS_GAME__?: {
      probe: () => GameProbe;
      screenOf: (x: number, z: number) => { x: number; y: number } | null;
      entityScreen: (id: string) => { x: number; y: number } | null;
    };
  }
}

function countCones(scene: THREE.Scene): number {
  let n = 0;
  scene.traverseVisible((o) => {
    if (o.name === 'cone-far' || o.name === 'cone-near') n += 1;
  });
  return n;
}

export function TestHooks({ controller }: { controller: GameController }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const project = (x: number, y: number, z: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const v = new THREE.Vector3(x, y, z).project(camera);
      if (v.z < -1 || v.z > 1) return null;
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };
    window.__OS_GAME__ = {
      probe: () => {
        const s = controller.world.state;
        return {
          tick: s.tick,
          status: s.status,
          paused: controller.paused,
          alarm: s.alarm.level,
          selected: [...useGameUi.getState().selected],
          conesVisible: countCones(scene),
          rigs: { ...rigCounts },
          operatives: s.operatives.map((op) => ({
            id: op.id,
            role: op.role,
            x: op.pos.x,
            z: op.pos.z,
            status: op.status,
            stance: op.stance,
            busy: op.action !== null,
          })),
        };
      },
      screenOf: (x, z) => project(x, controller.world.grid.heightAt({ x, z }), z),
      entityScreen: (id) => {
        const w = controller.world;
        const pos = w.operative(id)?.pos ?? w.guard(id)?.pos ?? w.object(id)?.pos;
        return pos ? project(pos.x, w.grid.heightAt(pos) + 0.9, pos.z) : null;
      },
    };
    return () => {
      delete window.__OS_GAME__;
    };
  }, [camera, controller, gl, scene]);

  return null;
}
