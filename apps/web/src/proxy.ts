import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

// Fast, optimistic redirect for signed-out visitors. This only checks that a session cookie exists;
// every protected page and API handler still validates the session against the database.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL('/sign-in', request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/test-range/:path*', '/missions/:path*', '/play/:path*'],
};
