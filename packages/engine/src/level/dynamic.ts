import type { LevelData } from './types';

/**
 * Runtime overlay on the static grid for things that change during a mission: closed or locked
 * doors, gates, cut fences, destroyed obstacles. Always derived from world objects (never saved).
 */
export class DynamicGrid {
  /** 0 = no change, 1 = blocked for movement, 2 = forced open (e.g. a cut fence gap). */
  readonly movement: Uint8Array;
  /** Extra occluder top height in metres (closed door / gate). */
  readonly occlusion: Float32Array;
  /** Sound attenuation in dB for a closed door in this cell. */
  readonly soundDamping: Uint8Array;

  constructor(level: LevelData) {
    const cells = level.cols * level.rows;
    this.movement = new Uint8Array(cells);
    this.occlusion = new Float32Array(cells);
    this.soundDamping = new Uint8Array(cells);
  }

  reset(): void {
    this.movement.fill(0);
    this.occlusion.fill(0);
    this.soundDamping.fill(0);
  }

  block(cells: readonly number[], options: { occlusion?: number; soundDamping?: number } = {}): void {
    for (const cell of cells) {
      this.movement[cell] = 1;
      if (options.occlusion) this.occlusion[cell] = Math.max(this.occlusion[cell]!, options.occlusion);
      if (options.soundDamping) this.soundDamping[cell] = Math.max(this.soundDamping[cell]!, options.soundDamping);
    }
  }

  open(cells: readonly number[]): void {
    for (const cell of cells) this.movement[cell] = 2;
  }

  /** Blocks sight and damps sound without blocking movement (a closed but unlocked door). */
  occlude(cells: readonly number[], height: number, soundDamping: number): void {
    for (const cell of cells) {
      this.occlusion[cell] = Math.max(this.occlusion[cell]!, height);
      this.soundDamping[cell] = Math.max(this.soundDamping[cell]!, soundDamping);
    }
  }
}
