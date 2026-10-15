import type { HealthResponse } from '@operation-shadow/schemas';

export const dynamic = 'force-dynamic';

/** Liveness: the server process is up. Does not touch the database. */
export function GET() {
  const body: HealthResponse = {
    status: 'ok',
    service: 'operation-shadow',
    version: process.env.npm_package_version ?? '0.1.0',
    time: new Date().toISOString(),
  };
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}
