import { redirect } from 'next/navigation';
import { getSession } from '@/server/session';

// Session-dependent: always rendered per request.
export const dynamic = 'force-dynamic';

export default async function Home() {
  redirect((await getSession()) ? '/dashboard' : '/sign-in');
}
