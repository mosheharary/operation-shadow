import type pg from 'pg';
import journal from '../migrations/meta/_journal.json' with { type: 'json' };

export interface ReadinessChecks {
  database: 'ok' | 'error';
  migrations: 'ok' | 'pending' | 'error';
}

/** Latest migration timestamp bundled with this build. */
export const LATEST_MIGRATION_WHEN: number = journal.entries.at(-1)?.when ?? 0;

/** Database reachable, and every migration shipped with this build has been applied. */
export async function checkReadiness(pool: pg.Pool): Promise<ReadinessChecks> {
  try {
    await pool.query('select 1');
  } catch {
    return { database: 'error', migrations: 'error' };
  }
  try {
    const result = await pool.query<{ latest: string | null }>(
      'select max(created_at)::text as latest from drizzle.__drizzle_migrations',
    );
    const applied = Number(result.rows[0]?.latest ?? 0);
    return { database: 'ok', migrations: applied >= LATEST_MIGRATION_WHEN ? 'ok' : 'pending' };
  } catch {
    // The migrations table does not exist yet.
    return { database: 'ok', migrations: 'pending' };
  }
}
