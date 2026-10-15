import { cancelGenerationJob } from '@operation-shadow/db';
import { ApiProblem, handle, json, requireApiSession, requireSameOrigin, requireUuid } from '@/server/api';
import { getDb } from '@/server/db';
import { jobDto } from '@/server/generation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const id = requireUuid((await params).id);
    const job = await cancelGenerationJob(getDb().db, session.user.id, id);
    if (!job) throw new ApiProblem('not_found', 'Not found');
    return json({ job: jobDto(job) });
  });
}
