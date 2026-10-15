import { attachDatabasePool } from '@vercel/functions';
import { createDbHandle, type DbHandle } from '@operation-shadow/db';
import { getServerEnv } from './env';

// One pool per server process (kept on globalThis so dev hot reloads don't leak pools).
const globalForDb = globalThis as typeof globalThis & { __operationShadowDb?: DbHandle };

export function getDb(): DbHandle {
  if (!globalForDb.__operationShadowDb) {
    const onVercel = Boolean(process.env.VERCEL);
    const handle = createDbHandle(getServerEnv().DATABASE_URL, { max: onVercel ? 5 : 10 });
    // On Vercel Fluid compute, release idle clients before a function instance is suspended.
    if (onVercel) attachDatabasePool(handle.pool);
    globalForDb.__operationShadowDb = handle;
  }
  return globalForDb.__operationShadowDb;
}
