import { runMigrations } from './migrate';

// Migrations use the direct connection (Neon: the non-pooler URL), falling back to DATABASE_URL.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  console.error('[migrate] DATABASE_URL_UNPOOLED or DATABASE_URL must be set');
  process.exit(1);
}

const started = Date.now();
try {
  await runMigrations(url);
  console.log(`[migrate] database is up to date (${Date.now() - started} ms)`);
} catch (err) {
  // Never print the connection string: it can contain credentials.
  console.error('[migrate] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
