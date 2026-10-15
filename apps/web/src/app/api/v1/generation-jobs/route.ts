import { after } from 'next/server';
import { countActiveGenerationJobs, countGenerationJobsSince, createGenerationJob, findGenerationJobByKey } from '@operation-shadow/db';
import { generationRequestSchema } from '@operation-shadow/schemas';
import { ApiProblem, handle, json, readJson, requireApiSession, requireSameOrigin } from '@/server/api';
import { getDb } from '@/server/db';
import { getServerEnv } from '@/server/env';
import { advanceJob, jobDto, newSeed, providerForNewJob } from '@/server/generation';

export const dynamic = 'force-dynamic';
// The first stage runs right after the response (model call with retries, then level validation).
export const maxDuration = 300;

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;

/** Starts generating an operation. Repeating a request with the same Idempotency-Key returns the same job. */
export async function POST(request: Request) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const key = request.headers.get('idempotency-key') ?? '';
    if (!IDEMPOTENCY_KEY.test(key)) throw new ApiProblem('bad_request', 'An Idempotency-Key header (8–100 letters, digits, - or _) is required');
    const body = await readJson(request, generationRequestSchema, 2048);
    const { db } = getDb();
    const ownerId = session.user.id;
    // A retried request returns its job even when the quota has since been reached.
    const existing = await findGenerationJobByKey(db, ownerId, key);
    if (existing) return json({ job: jobDto(existing) }, 200);

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if ((await countGenerationJobsSince(db, ownerId, dayAgo)) >= getServerEnv().AI_DAILY_JOBS_PER_USER) {
      throw new ApiProblem('rate_limited', 'Daily limit for new operations reached. Try again tomorrow, or replay one you already have');
    }
    if ((await countActiveGenerationJobs(db, ownerId)) >= 2) {
      throw new ApiProblem('conflict', 'Two operations are already being prepared. Wait for them to finish');
    }
    const provider = body.offline ? 'disabled' : await providerForNewJob();
    const { job, created } = await createGenerationJob(db, ownerId, { idempotencyKey: key, request: body, seed: newSeed(), provider });
    if (created) after(() => advanceJob(ownerId, job.id).then(() => undefined));
    return json({ job: jobDto(job) }, created ? 202 : 200);
  });
}
