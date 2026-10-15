import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkReadiness, createDbHandle, getPreferences, savePreferences, schema, type DbHandle } from '@operation-shadow/db';
import { runMigrations } from '@operation-shadow/db/migrate';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL must point at a disposable test database');

let handle: DbHandle;

async function resetDatabase() {
  const { pool } = createDbHandle(url!, { max: 1 });
  try {
    await pool.query('drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;');
  } finally {
    await pool.end();
  }
}

async function createUser(name: string) {
  const id = randomUUID();
  await handle.db.insert(schema.user).values({ id, name, email: `${id}@shadow.test`, updatedAt: new Date() });
  return id;
}

beforeAll(async () => {
  await resetDatabase();
  await runMigrations(url);
  handle = createDbHandle(url, { max: 2 });
});

afterAll(async () => {
  await handle?.pool.end();
});

describe('migrations', () => {
  it('create every table from an empty database', async () => {
    const { rows } = await handle.pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(['account', 'ai_usage', 'audit_events', 'generation_jobs', 'missions', 'rate_limit', 'session', 'user', 'user_preferences', 'verification']),
    );
  });

  it('are idempotent when re-applied', async () => {
    await expect(runMigrations(url)).resolves.toBeUndefined();
  });

  it('leave the database ready', async () => {
    await expect(checkReadiness(handle.pool)).resolves.toEqual({ database: 'ok', migrations: 'ok' });
  });

  it('report pending migrations when the migration history is missing', async () => {
    const scratch = createDbHandle(url, { max: 1 });
    try {
      await scratch.pool.query('alter table drizzle.__drizzle_migrations rename to __drizzle_migrations_hidden');
      await expect(checkReadiness(scratch.pool)).resolves.toEqual({ database: 'ok', migrations: 'pending' });
    } finally {
      await scratch.pool.query('alter table drizzle.__drizzle_migrations_hidden rename to __drizzle_migrations');
      await scratch.pool.end();
    }
  });
});

describe('preferences repository', () => {
  it('scopes every read and write to the owner', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');

    await savePreferences(handle.db, alice, { schemaVersion: 1, settings: { uiScale: 1.25 } });

    expect(await getPreferences(handle.db, alice)).toEqual({ schemaVersion: 1, settings: { uiScale: 1.25 } });
    expect(await getPreferences(handle.db, bob)).toBeNull();
  });

  it('upserts instead of duplicating', async () => {
    const carol = await createUser('Carol');
    await savePreferences(handle.db, carol, { schemaVersion: 1, settings: { subtitles: true } });
    await savePreferences(handle.db, carol, { schemaVersion: 1, settings: { subtitles: false } });
    expect(await getPreferences(handle.db, carol)).toEqual({ schemaVersion: 1, settings: { subtitles: false } });
  });

  it('cascades preference deletion with the user', async () => {
    const dave = await createUser('Dave');
    await savePreferences(handle.db, dave, { schemaVersion: 1, settings: {} });
    await handle.pool.query('delete from "user" where id = $1', [dave]);
    expect(await getPreferences(handle.db, dave)).toBeNull();
  });
});
