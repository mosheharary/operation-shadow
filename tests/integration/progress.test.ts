import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  completeMissionRun,
  createDbHandle,
  createGenerationJob,
  deleteSave,
  deleteUserAccount,
  getCampaign,
  getOrCreateActiveCampaign,
  listMissionRuns,
  listSaveSlots,
  readSave,
  schema,
  startMissionRun,
  updateCampaignProgress,
  writeSave,
  type DbHandle,
} from '@operation-shadow/db';
import { runMigrations } from '@operation-shadow/db/migrate';

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

const save = (n: number) => ({
  slot: 'quick',
  missionKey: 'silent-tide',
  summary: { n },
  schemaVersion: 1,
  payload: gzipSync(Buffer.from(JSON.stringify({ n }))),
  checksum: `sum-${n}`,
  sizeBytes: 10,
});

beforeAll(async () => {
  await runMigrations(url);
  handle = createDbHandle(url, { max: 4 });
  alice = await createUser('Alice');
  bob = await createUser('Bob');
});

afterAll(async () => {
  await handle?.pool.end();
});

describe('campaigns', () => {
  it('are created on first use and private to their owner', async () => {
    const defaults = { name: 'The Northern Reach', difficulty: 'standard', progress: {} };
    const a = await getOrCreateActiveCampaign(handle.db, alice, defaults);
    const again = await getOrCreateActiveCampaign(handle.db, alice, defaults);
    expect(again.id).toBe(a.id);
    expect(await getCampaign(handle.db, bob, a.id)).toBeNull();
    expect(await updateCampaignProgress(handle.db, bob, a.id, (p) => ({ ...p, hacked: true }))).toBeNull();
  });

  it('count concurrent progress updates without losing any', async () => {
    const c = await getOrCreateActiveCampaign(handle.db, alice, { name: 'x', difficulty: 'standard', progress: {} });
    const bump = () => updateCampaignProgress(handle.db, alice, c.id, (p) => ({ ...p, count: ((p.count as number) ?? 0) + 1 }));
    await Promise.all([bump(), bump(), bump()]);
    const after = await getCampaign(handle.db, alice, c.id);
    expect(after?.progress.count).toBe(3);
    expect(after?.version).toBe(c.version + 3);
  });
});

describe('mission runs', () => {
  it('finish once, only for their owner', async () => {
    const run = await startMissionRun(handle.db, alice, { campaignId: null, missionKey: 'boot-camp', squad: ['infiltrator', 'engineer'], difficulty: 'standard', seed: 7 });
    const result = { outcome: 'success', score: 1800, rank: 'A', medals: ['ghost'], durationSeconds: 150, stats: { detections: 0 } };
    expect(await completeMissionRun(handle.db, bob, run.id, result)).toBeNull();
    expect((await completeMissionRun(handle.db, alice, run.id, result))?.outcome).toBe('success');
    expect(await completeMissionRun(handle.db, alice, run.id, { ...result, outcome: 'failure' })).toBeNull();
    expect((await listMissionRuns(handle.db, bob)).length).toBe(0);
  });
});

describe('saves', () => {
  it('keep the newest three revisions and point the slot at the newest', async () => {
    for (let n = 1; n <= 5; n += 1) await writeSave(handle.db, alice, save(n));
    const read = await readSave(handle.db, alice, 'quick');
    expect(read?.revisions.map((r) => r.checksum)).toEqual(['sum-5', 'sum-4', 'sum-3']);
    expect(read?.slot.currentRevisionId).toBe(read?.revisions[0]?.id);
  });

  it('are invisible and undeletable to other users', async () => {
    expect(await readSave(handle.db, bob, 'quick')).toBeNull();
    expect(await deleteSave(handle.db, bob, 'quick')).toBe(false);
    expect((await listSaveSlots(handle.db, bob)).length).toBe(0);
    expect(await readSave(handle.db, alice, 'quick')).not.toBeNull();
  });

  it('a failed write leaves the previous save intact', async () => {
    await expect(writeSave(handle.db, alice, { ...save(6), payload: null as unknown as Buffer })).rejects.toThrow();
    const read = await readSave(handle.db, alice, 'quick');
    expect(read?.revisions[0]?.checksum).toBe('sum-5');
  });
});

describe('account deletion', () => {
  it('removes everything the user owns and nothing of anyone else', async () => {
    const carol = await createUser('Carol');
    await getOrCreateActiveCampaign(handle.db, carol, { name: 'c', difficulty: 'standard', progress: {} });
    await startMissionRun(handle.db, carol, { campaignId: null, missionKey: 'boot-camp', squad: ['infiltrator'], difficulty: 'standard', seed: 1 });
    await writeSave(handle.db, carol, save(1));
    await createGenerationJob(handle.db, carol, { idempotencyKey: 'k-carol', request: {}, seed: 1, provider: 'disabled' });
    expect(await deleteUserAccount(handle.db, carol)).toBe(true);
    for (const table of ['campaigns', 'mission_runs', 'save_slots', 'save_revisions', 'generation_jobs']) {
      const { rows } = await handle.pool.query(`select count(*)::int as n from ${table} where owner_id = $1`, [carol]);
      expect(rows[0].n, table).toBe(0);
    }
    expect(await readSave(handle.db, alice, 'quick')).not.toBeNull();
  });
});
