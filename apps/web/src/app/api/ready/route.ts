import { checkReadiness } from '@operation-shadow/db';
import type { ReadinessResponse } from '@operation-shadow/schemas';
import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/** Readiness: the database is reachable and every bundled migration has been applied. */
export async function GET() {
  let checks: ReadinessResponse['checks'];
  try {
    checks = await checkReadiness(getDb().pool);
  } catch {
    checks = { database: 'error', migrations: 'error' };
  }
  const ready = checks.database === 'ok' && checks.migrations === 'ok';
  const body: ReadinessResponse = { status: ready ? 'ready' : 'not_ready', checks };
  return Response.json(body, { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
