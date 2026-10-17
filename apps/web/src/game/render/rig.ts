import type * as THREE from 'three';
import { createFigure, type FigureLook, type FigurePose, poseFigure } from './figure';

/** What the unit renderer needs from a character, procedural or authored. */
/** How often a character's animation advances: every frame, every other frame, or not at all. */
export type AnimationRate = 'full' | 'half' | 'frozen';

export interface UnitRig {
  root: THREE.Group;
  lanternLight: THREE.Object3D | null;
  /**
   * Poses the character; `speed` is its ground speed in metres per second, `cameraDistance` how
   * far the camera is (for level of detail).
   */
  update(pose: FigurePose, dt: number, time: number, speed: number, cameraDistance?: number, rate?: AnimationRate): void;
  dispose(): void;
}

/** How many characters are drawn with each kind of rig (read by the browser-test probe). */
export const rigCounts = { authored: 0, procedural: 0 };

/** The procedural figure (Performance preset, and while authored models load). */
export function proceduralRig(look: FigureLook): UnitRig {
  const figure = createFigure(look);
  return {
    root: figure.root,
    lanternLight: figure.lanternLight,
    update: (pose, dt, time, _speed, _distance, rate = 'full') => {
      if (rate !== 'frozen') poseFigure(figure, pose, dt, time);
    },
    dispose: () => {},
  };
}
