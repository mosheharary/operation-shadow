import { BOOT_CAMP, FROZEN_LEDGER, IRON_JUNCTION, LAST_LIGHT, WHITE_SILENCE } from './missions/campaign';
import { SILENT_TIDE } from './missions/silent-tide';
import type { MissionEntry } from './missions/types';

export * from './abilities';
export * from './dialogue';
export * from './missions/generated';
export * from './missions/squad';
export * from './missions/types';
export { BOOT_CAMP, FROZEN_LEDGER, IRON_JUNCTION, LAST_LIGHT, WHITE_SILENCE } from './missions/campaign';
export { buildSilentTide, SILENT_TIDE, SILENT_TIDE_SEED } from './missions/silent-tide';
export * from './specialists';

/** Campaign order: the tutorial, then the five operations of the Northern Reach. */
export const CAMPAIGN: readonly MissionEntry[] = [BOOT_CAMP, SILENT_TIDE, WHITE_SILENCE, IRON_JUNCTION, FROZEN_LEDGER, LAST_LIGHT];

export const MISSIONS: Record<string, MissionEntry> = Object.fromEntries(CAMPAIGN.map((m) => [m.key, m]));

export function getMission(key: string): MissionEntry | undefined {
  return MISSIONS[key];
}
