import { deleteCampaign, recordAuditEvent, setCampaignDifficulty } from '@operation-shadow/db';
import { difficultySchema } from '@operation-shadow/schemas';
import { z } from 'zod';
import { ApiProblem, handle, json, readJson, requireApiSession, requireSameOrigin, requireUuid } from '@/server/api';
import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const id = requireUuid((await params).id);
    const body = await readJson(request, z.strictObject({ difficulty: difficultySchema }));
    const row = await setCampaignDifficulty(getDb().db, session.user.id, id, body.difficulty);
    if (!row) throw new ApiProblem('not_found', 'Not found');
    return json({ campaign: { id: row.id, difficulty: row.difficulty } });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const id = requireUuid((await params).id);
    if (!(await deleteCampaign(getDb().db, session.user.id, id))) throw new ApiProblem('not_found', 'Not found');
    await recordAuditEvent(getDb().db, { userId: session.user.id, kind: 'campaign_deleted', metadata: { campaignId: id } });
    return json({ deleted: id });
  });
}
