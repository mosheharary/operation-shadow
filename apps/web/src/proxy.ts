import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

const PROTECTED = ['/dashboard', '/test-range', '/missions', '/play', '/operations', '/account'];

/**
 * Content-Security-Policy with a per-request nonce: Next.js applies the nonce to its own scripts,
 * and `strict-dynamic` lets those load the rest. Development adds what hot reloading needs.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // React style attributes and CSS-in-JS from three.js helpers need inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // blob: lets the glTF loader decode embedded model textures (it fetches them as blob URLs).
    `connect-src 'self' blob:${dev ? ' ws: wss:' : ''}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

// Fast, optimistic redirect for signed-out visitors. This only checks that a session cookie exists;
// every protected page and API handler still validates the session against the database.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PROTECTED.some((p) => path === p || path.startsWith(`${p}/`)) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // Everything except static assets (which carry no scripts).
  matcher: [{ source: '/((?!_next/static|_next/image|media/|icon.svg|favicon.ico).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] }],
};
