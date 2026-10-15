import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/server/auth';

export const dynamic = 'force-dynamic';

// The auth instance is created on first request, never at import time.
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
