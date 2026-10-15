import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDbHandle } from './client';

// Node-only entry point (`@operation-shadow/db/migrate`) for the migration CLI and tests.
// It is deliberately not exported from the package index, which the web bundle imports.
function migrationsFolder(): string {
  const here = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../migrations');
}

/** Applies pending migrations. Uses a single connection; never wraps a long-running external call. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, pool } = createDbHandle(connectionString, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: migrationsFolder() });
  } finally {
    await pool.end();
  }
}
