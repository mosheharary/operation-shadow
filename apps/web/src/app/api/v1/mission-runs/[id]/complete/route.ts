import { completeMissionRun } from '@operation-shadow/db';
import { completeRunSchema } from '@operation-shadow/schemas';
import { ApiProblem, handle, json, readJson, requireApiSession, requireSameOrigin, requireUuid } from '@/server/api';
import { getDb } from '@/server/db';
import { recordRunInCampaign } from '@/server/progress';

export const dynamic = 'force-dynamic';

/**
 * Records how an attempt ended. The game is single-player and simulated in the browser, so the
 * result is the client's report; it only affects the player's own progress.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const id = requireUuid((await params).id);
    const body = await readJson(request, completeRunSchema);
    const run = await completeMissionRun(getDb().db, session.user.id, id, body);
    if (!run) throw new ApiProblem('not_found', 'Not found');
    await recordRunInCampaign(session.user.id, run);
    return json({ run: { id: run.id, outcome: run.outcome } });
  });
}
