import type * as THREE from 'three';
import { createFigure, type FigureLook, type FigurePose, poseFigure } from './figure';

/** What the unit renderer needs from a character, procedural or authored. */
export interface UnitRig {
  root: THREE.Group;
  lanternLight: THREE.Object3D | null;
  /** Poses the character; `speed` is its ground speed in metres per second. */
  update(pose: FigurePose, dt: number, time: number, speed: number): void;
  dispose(): void;
}

/** The procedural figure (Performance preset, and while authored models load). */
export function proceduralRig(look: FigureLook): UnitRig {
  const figure = createFigure(look);
  return {
    root: figure.root,
    lanternLight: figure.lanternLight,
    update: (pose, dt, time) => poseFigure(figure, pose, dt, time),
    dispose: () => {},
  };
}
