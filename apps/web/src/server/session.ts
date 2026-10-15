import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from './auth';

/** Authoritative, database-backed session lookup for Server Components and route handlers. */
export async function getSession() {
  // Read request headers first: this marks the route as dynamic before any runtime secret is needed.
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
}

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Redirects to sign-in when there is no valid session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  return session;
}
