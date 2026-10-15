import { SILENT_TIDE } from './missions/silent-tide';
import type { MissionEntry } from './missions/types';

export * from './abilities';
export * from './dialogue';
export * from './missions/squad';
export * from './missions/types';
export { buildSilentTide, SILENT_TIDE, SILENT_TIDE_SEED } from './missions/silent-tide';
export * from './specialists';

export const MISSIONS: Record<string, MissionEntry> = {
  [SILENT_TIDE.key]: SILENT_TIDE,
};

export function getMission(key: string): MissionEntry | undefined {
  return MISSIONS[key];
}
