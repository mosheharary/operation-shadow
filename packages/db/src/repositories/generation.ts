import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { aiUsage, generationJobs, missions } from '../schema/generation';

export type JobRow = typeof generationJobs.$inferSelect;
export type MissionRow = typeof missions.$inferSelect;

export const ACTIVE_STAGES = ['queued', 'drafting', 'validating', 'building'] as const;
/** A job whose lease expired this many times is given up (plan §8.3: stale jobs expire). */
export const MAX_JOB_ATTEMPTS = 3;

// Every function that reads or changes a user's rows takes the owner's id from the session.

/** Creates a job, or returns the existing one for the same idempotency key. */
export async function createGenerationJob(
  db: Database,
  ownerId: string,
  input: { idempotencyKey: string; request: Record<string, unknown>; seed: number; provider: string },
): Promise<{ job: JobRow; created: boolean }> {
  const inserted = await db
    .insert(generationJobs)
    .values({ ownerId, idempotencyKey: input.idempotencyKey, request: input.request, seed: input.seed, provider: input.provider })
    .onConflictDoNothing({ target: [generationJobs.ownerId, generationJobs.idempotencyKey] })
    .returning();
  if (inserted[0]) return { job: inserted[0], created: true };
  const existing = await db
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.ownerId, ownerId), eq(generationJobs.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  return { job: existing[0]!, created: false };
}

export async function findGenerationJobByKey(db: Database, ownerId: string, idempotencyKey: string): Promise<JobRow | null> {
  const rows = await db
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.ownerId, ownerId), eq(generationJobs.idempotencyKey, idempotencyKey)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getGenerationJob(db: Database, ownerId: string, jobId: string): Promise<JobRow | null> {
  const rows = await db
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.ownerId, ownerId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomically claims an unfinished job whose lease is free or expired. Returns null when another
 * worker holds it or it is already finished. A job claimed too often is marked failed instead.
 */
export async function claimGenerationJob(db: Database, ownerId: string, jobId: string, leaseMs: number): Promise<JobRow | null> {
  const rows = await db
    .update(generationJobs)
    .set({
      attempts: sql`${generationJobs.attempts} + 1`,
      leaseUntil: sql`now() + make_interval(secs => ${leaseMs / 1000})`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(generationJobs.id, jobId),
        eq(generationJobs.ownerId, ownerId),
        inArray(generationJobs.stage, [...ACTIVE_STAGES]),
        or(isNull(generationJobs.leaseUntil), lt(generationJobs.leaseUntil, sql`now()`)),
      ),
    )
    .returning();
  const job = rows[0];
  if (!job) return null;
  if (job.attempts > MAX_JOB_ATTEMPTS) {
    await failGenerationJob(db, job.id, 'The operation could not be prepared. Please try again.');
    return null;
  }
  return job;
}

/** Records progress and renews the lease; does nothing if the job was cancelled meanwhile. */
export async function setGenerationJobStage(db: Database, jobId: string, stage: (typeof ACTIVE_STAGES)[number], leaseMs: number): Promise<boolean> {
  const rows = await db
    .update(generationJobs)
    .set({ stage, leaseUntil: sql`now() + make_interval(secs => ${leaseMs / 1000})`, updatedAt: sql`now()` })
    .where(and(eq(generationJobs.id, jobId), inArray(generationJobs.stage, [...ACTIVE_STAGES])))
    .returning({ id: generationJobs.id });
  return rows.length > 0;
}

/** Stores the mission and marks the job ready in one transaction. Returns null if the job is no longer active. */
export async function completeGenerationJob(
  db: Database,
  job: Pick<JobRow, 'id' | 'ownerId'>,
  mission: Omit<typeof missions.$inferInsert, 'id' | 'ownerId' | 'createdAt'>,
): Promise<MissionRow | null> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ stage: generationJobs.stage })
      .from(generationJobs)
      .where(eq(generationJobs.id, job.id))
      .for('update')
      .limit(1);
    if (!locked[0] || !(ACTIVE_STAGES as readonly string[]).includes(locked[0].stage)) return null;
    const [row] = await tx.insert(missions).values({ ...mission, ownerId: job.ownerId }).returning();
    await tx
      .update(generationJobs)
      .set({ stage: 'ready', missionId: row!.id, leaseUntil: null, error: null, updatedAt: sql`now()` })
      .where(eq(generationJobs.id, job.id));
    return row!;
  });
}

export async function failGenerationJob(db: Database, jobId: string, message: string): Promise<void> {
  await db
    .update(generationJobs)
    .set({ stage: 'failed', error: message.slice(0, 200), leaseUntil: null, updatedAt: sql`now()` })
    .where(and(eq(generationJobs.id, jobId), inArray(generationJobs.stage, [...ACTIVE_STAGES])));
}

export async function cancelGenerationJob(db: Database, ownerId: string, jobId: string): Promise<JobRow | null> {
  const rows = await db
    .update(generationJobs)
    .set({ stage: 'cancelled', leaseUntil: null, updatedAt: sql`now()` })
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.ownerId, ownerId), inArray(generationJobs.stage, [...ACTIVE_STAGES])))
    .returning();
  return rows[0] ?? (await getGenerationJob(db, ownerId, jobId));
}

export async function countGenerationJobsSince(db: Database, ownerId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(generationJobs)
    .where(and(eq(generationJobs.ownerId, ownerId), gte(generationJobs.createdAt, since)));
  return rows[0]?.n ?? 0;
}

export async function countActiveGenerationJobs(db: Database, ownerId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.ownerId, ownerId),
        inArray(generationJobs.stage, [...ACTIVE_STAGES]),
        gte(generationJobs.createdAt, sql`now() - interval '10 minutes'`),
      ),
    );
  return rows[0]?.n ?? 0;
}

export async function recordAiUsage(db: Database, rows: (typeof aiUsage.$inferInsert)[]): Promise<void> {
  if (rows.length > 0) await db.insert(aiUsage).values(rows);
}

/** Estimated spend across all users since a moment (the global monthly cap). */
export async function aiSpendSince(db: Database, since: Date): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float8` })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, since));
  return rows[0]?.total ?? 0;
}

export async function getOwnedMission(db: Database, ownerId: string, missionId: string): Promise<MissionRow | null> {
  const rows = await db
    .select()
    .from(missions)
    .where(and(eq(missions.id, missionId), eq(missions.ownerId, ownerId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listOwnedMissions(db: Database, ownerId: string, limit = 12) {
  return db
    .select({ id: missions.id, title: missions.title, source: missions.source, templateId: missions.templateId, createdAt: missions.createdAt })
    .from(missions)
    .where(eq(missions.ownerId, ownerId))
    .orderBy(desc(missions.createdAt))
    .limit(limit);
}
