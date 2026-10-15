import { LevelBuilder } from '../level/builder';
import type { LevelData } from '../level/types';

/**
 * Builds a small flat test level. The callback can paint walls, water and features before
 * finalization. Used by unit and scenario tests; not part of the shipped game.
 */
export function buildTestLevel(
  options: { width?: number; depth?: number; id?: string; height?: (x: number, z: number) => number } = {},
  paint?: (builder: LevelBuilder) => void,
): LevelData {
  const builder = new LevelBuilder({
    id: options.id ?? 'test-level',
    templateId: 'test',
    seed: 1,
    generatorVersion: 'test',
    width: options.width ?? 40,
    depth: options.depth ?? 40,
  });
  builder.setHeight(options.height ?? (() => 0));
  paint?.(builder);
  return builder.finalize();
}
