import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  aiSpendSince,
  cancelGenerationJob,
  claimGenerationJob,
  completeGenerationJob,
  createDbHandle,
  createGenerationJob,
  getGenerationJob,
  getOwnedMission,
  listOwnedMissions,
  recordAiUsage,
  schema,
  setGenerationJobStage,
  type DbHandle,
} from '@operation-shadow/db';
import { runMigrations } from '@operation-shadow/db/migrate';
import { disabledProvider, generateMission } from '@operation-shadow/ai';
import { generationRequestSchema } from '@operation-shadow/schemas';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL must point at a disposable test database');

let handle: DbHandle;
let alice: string;
let bob: string;

async function createUser(name: string) {
  const id = randomUUID();
  await handle.db.insert(schema.user).values({ id, name, email: `${id}@shadow.test`, updatedAt: new Date() });
  return id;
}

const MISSION = async () => {
  const out = await generateMission({ request: generationRequestSchema.parse({ theatre: 'coastal' }), key: 'op-x', seed: 11, provider: disabledProvider });
  return {
    source: out.source,
    templateId: out.spec.templateId,
    specVersion: 1,
    generatorVersion: out.report.generatorVersion,
    seed: 11,
    title: out.spec.title,
    spec: out.spec as unknown as Record<string, unknown>,
    briefing: out.briefing as unknown as Record<string, unknown>,
    levelHash: out.report.levelHash,
    report: out.report as unknown as Record<string, unknown>,
  };
};

beforeAll(async () => {
  await runMigrations(url);
  handle = createDbHandle(url, { max: 4 });
  alice = await createUser('Alice');
  bob = await createUser('Bob');
});

afterAll(async () => {
  await handle?.pool.end();
});

describe('generation jobs', () => {
  it('are idempotent per owner and key', async () => {
    const a = await createGenerationJob(handle.db, alice, { idempotencyKey: 'key-1', request: {}, seed: 1, provider: 'disabled' });
    const again = await createGenerationJob(handle.db, alice, { idempotencyKey: 'key-1', request: {}, seed: 2, provider: 'disabled' });
    const other = await createGenerationJob(handle.db, bob, { idempotencyKey: 'key-1', request: {}, seed: 3, provider: 'disabled' });
    expect(a.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.job.id).toBe(a.job.id);
    expect(other.job.id).not.toBe(a.job.id);
  });

  it('are claimed by one worker at a time and re-claimable after the lease expires', async () => {
    const { job } = await createGenerationJob(handle.db, alice, { idempotencyKey: 'key-lease', request: {}, seed: 1, provider: 'disabled' });
    const [first, second] = await Promise.all([claimGenerationJob(handle.db, alice, job.id, 60_000), claimGenerationJob(handle.db, alice, job.id, 60_000)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    await handle.pool.query("update generation_jobs set lease_until = now() - interval '1 second' where id = $1", [job.id]);
    const reclaimed = await claimGenerationJob(handle.db, alice, job.id, 60_000);
    expect(reclaimed?.attempts).toBe(2);
  });

  it('expire after too many abandoned attempts', async () => {
    const { job } = await createGenerationJob(handle.db, alice, { idempotencyKey: 'key-stale', request: {}, seed: 1, provider: 'disabled' });
    await handle.pool.query('update generation_jobs set attempts = 3 where id = $1', [job.id]);
    expect(await claimGenerationJob(handle.db, alice, job.id, 60_000)).toBeNull();
    expect((await getGenerationJob(handle.db, alice, job.id))?.stage).toBe('failed');
  });

  it('cannot be claimed, read or cancelled by another user', async () => {
    const { job } = await createGenerationJob(handle.db, alice, { idempotencyKey: 'key-own', request: {}, seed: 1, provider: 'disabled' });
    expect(await claimGenerationJob(handle.db, bob, job.id, 60_000)).toBeNull();
    expect(await getGenerationJob(handle.db, bob, job.id)).toBeNull();
    expect(await cancelGenerationJob(handle.db, bob, job.id)).toBeNull();
    expect((await getGenerationJob(handle.db, alice, job.id))?.stage).toBe('queued');
  });

  it('store the mission and finish atomically, exactly once', async () => {
    const { job } = await createGenerationJob(handle.db, alice, { idempotencyKey: 'key-done', request: {}, seed: 1, provider: 'disabled' });
    await claimGenerationJob(handle.db, alice, job.id, 60_000);
    expect(await setGenerationJobStage(handle.db, job.id, 'building', 60_000)).toBe(true);
    const mission = await MISSION();
    const [m1, m2] = await Promise.all([completeGenerationJob(handle.db, job, mission), completeGenerationJob(handle.db, job, mission)]);
    const stored = [m1, m2].filter(Boolean);
    expect(stored).toHaveLength(1);
    const done = await getGenerationJob(handle.db, alice, job.id);
    expect(done?.stage).toBe('ready');
    expect(done?.missionId).toBe(stored[0]!.id);
    expect(await getOwnedMission(handle.db, bob, stored[0]!.id)).toBeNull();
    expect((await listOwnedMissions(handle.db, alice)).map((m) => m.id)).toContain(stored[0]!.id);
    expect(await listOwnedMissions(handle.db, bob)).toEqual([]);
  });

  it('cancelled jobs do not store a mission', async () => {
    const { job } = await createGenerationJob(handle.db, alice, { idempotencyKey: 'key-cancel', request: {}, seed: 1, provider: 'disabled' });
    await claimGenerationJob(handle.db, alice, job.id, 60_000);
    expect((await cancelGenerationJob(handle.db, alice, job.id))?.stage).toBe('cancelled');
    expect(await setGenerationJobStage(handle.db, job.id, 'drafting', 60_000)).toBe(false);
    expect(await completeGenerationJob(handle.db, job, await MISSION())).toBeNull();
  });

  it('track spend for the monthly budget', async () => {
    const since = new Date(Date.now() - 1000);
    await recordAiUsage(handle.db, [
      { userId: alice, purpose: 'mission-plan', provider: 'gemini', model: 'gemini-3.8-flash', inputTokens: 600, outputTokens: 600, costUsd: 0.0027, latencyMs: 12000, status: 'ok' },
      { userId: bob, purpose: 'mission-plan', provider: 'gemini', model: 'gemini-3.8-flash', costUsd: 0.001, status: 'invalid' },
    ]);
    expect(await aiSpendSince(handle.db, since)).toBeCloseTo(0.0037, 6);
  });
});
