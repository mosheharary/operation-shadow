import { startMissionRun } from '@operation-shadow/db';
import { getMission } from '@operation-shadow/content';
import { startRunSchema } from '@operation-shadow/schemas';
import { ApiProblem, handle, json, readJson, requireApiSession, requireSameOrigin } from '@/server/api';
import { getDb } from '@/server/db';
import { resolveMission } from '@/server/missions';
import { activeCampaign } from '@/server/progress';

export const dynamic = 'force-dynamic';

/** Records the start of an attempt (campaign missions are attached to the active campaign). */
export async function POST(request: Request) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const body = await readJson(request, startRunSchema);
    if (!(await resolveMission(body.missionKey, session.user.id))) throw new ApiProblem('bad_request', 'Unknown mission');
    const campaign = await activeCampaign(session.user.id);
    const run = await startMissionRun(getDb().db, session.user.id, { ...body, campaignId: getMission(body.missionKey) || body.missionKey.startsWith('op-') ? campaign.id : null });
    return json({ run: { id: run.id } }, 201);
  });
}
