import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkReadiness, createDbHandle, getPreferences } from '@operation-shadow/db';
import { runMigrations } from '@operation-shadow/db/migrate';

// Upgrade path: a database created by the first release (migration 0000 only) with real rows is
// brought to the current schema by the normal migrator, and its data survives.

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL must point at a disposable test database');

const MIGRATIONS = path.resolve('packages/db/migrations');
let firstReleaseOnly: string;

async function reset() {
  const { pool } = createDbHandle(url!, { max: 1 });
  try {
    await pool.query('drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;');
  } finally {
    await pool.end();
  }
}

beforeAll(async () => {
  firstReleaseOnly = await mkdtemp(path.join(os.tmpdir(), 'os-migrations-'));
  await cp(MIGRATIONS, firstReleaseOnly, { recursive: true });
  const journalPath = path.join(firstReleaseOnly, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((e) => e.idx === 0);
  await writeFile(journalPath, JSON.stringify(journal));
});

afterAll(async () => {
  await rm(firstReleaseOnly, { recursive: true, force: true });
});

describe('upgrade migrations', () => {
  it('upgrade a first-release database with data to the current schema', async () => {
    await reset();
    const old = createDbHandle(url, { max: 1 });
    try {
      await migrate(old.db, { migrationsFolder: firstReleaseOnly });
      await old.pool.query(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('u-old', 'Veteran', 'veteran@shadow.test', true, now(), now())`);
      await old.pool.query(`insert into user_preferences (user_id, schema_version, settings) values ('u-old', 1, '{"masterVolume":0.3}')`);
      const before = await checkReadiness(old.pool);
      expect(before.migrations).toBe('pending');
    } finally {
      await old.pool.end();
    }

    await runMigrations(url);
    const handle = createDbHandle(url, { max: 1 });
    try {
      expect(await checkReadiness(handle.pool)).toEqual({ database: 'ok', migrations: 'ok' });
      expect((await getPreferences(handle.db, 'u-old'))?.settings).toEqual({ masterVolume: 0.3 });
      const { rows } = await handle.pool.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('missions', 'generation_jobs', 'ai_usage', 'campaigns', 'mission_runs', 'save_slots', 'save_revisions')");
      expect(rows[0].n).toBe(7);
    } finally {
      await handle.pool.end();
    }
  });
});
