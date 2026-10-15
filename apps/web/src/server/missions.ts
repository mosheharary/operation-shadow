import { type GeneratedMissionData, generatedMissionEntry, getMission, type MissionEntry } from '@operation-shadow/content';
import { loadGeneratedMission } from './generation';

/** Campaign missions by key; generated operations (`op-<uuid>`) only for their owner. */
export async function resolveMission(key: string, ownerId: string): Promise<{ entry: MissionEntry; generated?: GeneratedMissionData } | null> {
  const authored = getMission(key);
  if (authored) return { entry: authored };
  if (!key.startsWith('op-')) return null;
  const generated = await loadGeneratedMission(ownerId, key);
  const entry = generated ? generatedMissionEntry(generated) : null;
  return entry && generated ? { entry, generated } : null;
}
