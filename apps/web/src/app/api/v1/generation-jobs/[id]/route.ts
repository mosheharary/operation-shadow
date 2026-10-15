import { getGenerationJob, getOwnedMission } from '@operation-shadow/db';
import { ApiProblem, handle, json, requireApiSession, requireUuid } from '@/server/api';
import { getDb } from '@/server/db';
import { jobDto } from '@/server/generation';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireApiSession();
    const id = requireUuid((await params).id);
    const { db } = getDb();
    const job = await getGenerationJob(db, session.user.id, id);
    if (!job) throw new ApiProblem('not_found', 'Not found');
    const mission = job.missionId ? await getOwnedMission(db, session.user.id, job.missionId) : null;
    return json({ job: jobDto(job, mission) });
  });
}
