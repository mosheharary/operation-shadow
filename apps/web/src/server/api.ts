import type { ApiError, ApiErrorCode } from '@operation-shadow/schemas';
import type { z } from 'zod';
import { getServerEnv } from './env';
import { getSession, type Session } from './session';

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  internal: 500,
  service_unavailable: 503,
};

/** Thrown inside handlers; turned into the standard error envelope by `handle`. */
export class ApiProblem extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function errorResponse(code: ApiErrorCode, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return json(body, STATUS[code]);
}

/**
 * Wraps a route handler: known problems become the error envelope; anything else is logged
 * without details and answered with a generic message, so internals never leak.
 */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ApiProblem) return errorResponse(err.code, err.message);
    console.error('[api] unhandled error', err instanceof Error ? err.name : typeof err);
    return errorResponse('internal', 'Something went wrong. Please try again.');
  }
}

export async function requireApiSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiProblem('unauthorized', 'Sign in first');
  return session;
}

/**
 * CSRF defence for state-changing requests: browsers always send Origin on POST; it must be this
 * app. Better Auth's SameSite=Lax cookie is the second layer.
 */
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const allowed = new URL(getServerEnv().BETTER_AUTH_URL).origin;
  const own = new URL(request.url).origin;
  if (!origin || (origin !== allowed && origin !== own)) throw new ApiProblem('forbidden', 'Cross-site request refused');
}

/** Reads and validates a JSON body no larger than `maxBytes`. */
export async function readJson<S extends z.ZodType>(request: Request, schema: S, maxBytes = 16 * 1024): Promise<z.infer<S>> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new ApiProblem('payload_too_large', 'Request body is too large');
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiProblem('payload_too_large', 'Request body is too large');
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiProblem('bad_request', 'Request body must be JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiProblem('bad_request', first ? `${first.path.join('.') || 'body'}: ${first.message}`.slice(0, 200) : 'Invalid request');
  }
  return parsed.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids that are not UUIDs are reported as not found, like ids owned by someone else. */
export function requireUuid(id: string): string {
  if (!UUID.test(id)) throw new ApiProblem('not_found', 'Not found');
  return id.toLowerCase();
}
