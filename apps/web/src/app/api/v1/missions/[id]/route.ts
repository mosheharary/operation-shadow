import { deleteOwnedMission, recordAuditEvent } from '@operation-shadow/db';
import { ApiProblem, handle, json, requireApiSession, requireSameOrigin, requireUuid } from '@/server/api';
import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/** Deletes one of the player's generated operations (and their saves of it). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const id = requireUuid((await params).id);
    if (!(await deleteOwnedMission(getDb().db, session.user.id, id))) throw new ApiProblem('not_found', 'Not found');
    await recordAuditEvent(getDb().db, { userId: session.user.id, kind: 'mission_deleted', metadata: { missionId: id } });
    return json({ deleted: id });
  });
}
