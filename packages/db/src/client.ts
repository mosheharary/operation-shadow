import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
}

export interface DbOptions {
  /** Maximum pool size. Keep small on serverless (connections are pooled by Neon/PgBouncer). */
  max?: number;
}

/**
 * One code path for local Postgres and Neon: a standard TCP pool via `pg`. On Neon, pass the pooled
 * ("-pooler") connection string at runtime and the direct one for migrations; TLS is negotiated from
 * the connection string (`sslmode=require`).
 */
export function createDbHandle(connectionString: string, options: DbOptions = {}): DbHandle {
  if (!connectionString) throw new Error('Database connection string is empty');
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return { db: drizzle({ client: pool, schema }), pool };
}
