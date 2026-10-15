import { createCampaign, listCampaigns } from '@operation-shadow/db';
import { difficultySchema, EMPTY_PROGRESS } from '@operation-shadow/schemas';
import { z } from 'zod';
import { handle, json, readJson, requireApiSession, requireSameOrigin } from '@/server/api';
import { getDb } from '@/server/db';
import { activeCampaign, CAMPAIGN_NAME, readProgress } from '@/server/progress';

export const dynamic = 'force-dynamic';

const view = (c: { id: string; name: string; difficulty: string; progress: unknown; updatedAt: Date }) => ({
  id: c.id,
  name: c.name,
  difficulty: c.difficulty,
  progress: readProgress(c.progress),
  updatedAt: c.updatedAt.toISOString(),
});

export async function GET() {
  return handle(async () => {
    const session = await requireApiSession();
    const active = await activeCampaign(session.user.id);
    const all = await listCampaigns(getDb().db, session.user.id);
    return json({ active: view(active), campaigns: all.map(view) });
  });
}

/** Starts a new campaign (the old one is kept; the newest is the active one). */
export async function POST(request: Request) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const body = await readJson(request, z.strictObject({ difficulty: difficultySchema }));
    const campaign = await createCampaign(getDb().db, session.user.id, { name: CAMPAIGN_NAME, difficulty: body.difficulty, progress: structuredClone(EMPTY_PROGRESS) });
    return json({ campaign: view(campaign) }, 201);
  });
}
