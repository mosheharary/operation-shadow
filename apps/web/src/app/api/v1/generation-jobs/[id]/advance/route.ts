import { getOwnedMission } from '@operation-shadow/db';
import { ApiProblem, handle, json, requireApiSession, requireSameOrigin, requireUuid } from '@/server/api';
import { getDb } from '@/server/db';
import { advanceJob, jobDto } from '@/server/generation';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Drives the job if nobody holds its lease (for example when the first worker was stopped), then
 * returns its state. Returns immediately while another request is working on it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const id = requireUuid((await params).id);
    const job = await advanceJob(session.user.id, id);
    if (!job) throw new ApiProblem('not_found', 'Not found');
    const mission = job.missionId ? await getOwnedMission(getDb().db, session.user.id, job.missionId) : null;
    return json({ job: jobDto(job, mission) });
  });
}
