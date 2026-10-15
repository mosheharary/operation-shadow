import { getOrCreateActiveCampaign, updateCampaignProgress, type RunRow } from '@operation-shadow/db';
import { getMission } from '@operation-shadow/content';
import { type CampaignProgress, campaignProgressSchema, EMPTY_PROGRESS, RANKS } from '@operation-shadow/schemas';
import { getDb } from './db';

export const CAMPAIGN_NAME = 'The Northern Reach';

export function readProgress(raw: unknown): CampaignProgress {
  const parsed = campaignProgressSchema.safeParse(raw);
  return parsed.success ? parsed.data : structuredClone(EMPTY_PROGRESS);
}

export function activeCampaign(ownerId: string) {
  return getOrCreateActiveCampaign(getDb().db, ownerId, { name: CAMPAIGN_NAME, difficulty: 'standard', progress: structuredClone(EMPTY_PROGRESS) });
}

const better = (a: string, b: string) => RANKS.indexOf(a as (typeof RANKS)[number]) < RANKS.indexOf(b as (typeof RANKS)[number]);

/** Folds a finished run into its campaign: best result per mission, service records, flags. */
export async function recordRunInCampaign(ownerId: string, run: RunRow): Promise<void> {
  if (!run.campaignId) return;
  await updateCampaignProgress(getDb().db, ownerId, run.campaignId, (raw) => {
    const progress = readProgress(raw);
    for (const role of run.squad) {
      const record = progress.service[role] ?? { missions: 0, successes: 0 };
      record.missions += 1;
      if (run.outcome === 'success') record.successes += 1;
      progress.service[role] = record;
    }
    // Only campaign missions count toward completion; generated operations still log service.
    if (run.outcome === 'success' && getMission(run.missionKey)) {
      const now = new Date().toISOString();
      const prev = progress.completed[run.missionKey];
      const rank = (run.rank ?? 'D') as (typeof RANKS)[number];
      const medals = (run.medals ?? []) as CampaignProgress['completed'][string]['medals'];
      progress.completed[run.missionKey] = prev
        ? {
            bestScore: Math.max(prev.bestScore, run.score ?? 0),
            bestRank: better(rank, prev.bestRank) ? rank : prev.bestRank,
            medals: [...new Set([...prev.medals, ...medals])],
            completions: prev.completions + 1,
            lastCompletedAt: now,
          }
        : { bestScore: run.score ?? 0, bestRank: rank, medals, completions: 1, lastCompletedAt: now };
      const flag = `completed:${run.missionKey}`;
      if (!progress.flags.includes(flag)) progress.flags.push(flag);
    }
    return progress as unknown as Record<string, unknown>;
  });
}
