import { BOOT_CAMP, IRON_JUNCTION, WHITE_SILENCE } from './missions/campaign';
import { SILENT_TIDE } from './missions/silent-tide';
import type { MissionEntry } from './missions/types';

export * from './abilities';
export * from './dialogue';
export * from './missions/generated';
export * from './missions/squad';
export * from './missions/types';
export { BOOT_CAMP, IRON_JUNCTION, WHITE_SILENCE } from './missions/campaign';
export { buildSilentTide, SILENT_TIDE, SILENT_TIDE_SEED } from './missions/silent-tide';
export * from './specialists';

/** Campaign order: the tutorial, then the five operations of the Northern Reach. */
/** The four starting missions, one per hand-built map; everything else is a generated operation. */
export const CAMPAIGN: readonly MissionEntry[] = [BOOT_CAMP, SILENT_TIDE, WHITE_SILENCE, IRON_JUNCTION];

export const MISSIONS: Record<string, MissionEntry> = Object.fromEntries(CAMPAIGN.map((m) => [m.key, m]));

export function getMission(key: string): MissionEntry | undefined {
  return MISSIONS[key];
}
