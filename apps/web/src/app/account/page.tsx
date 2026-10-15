import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/server/session';
import { DeleteAccount } from './delete-account';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const session = await requireSession();
  return (
    <main className="hq">
      <div className="hq__inner">
        <nav className="hint">
          <Link href="/dashboard">Field HQ</Link> / Account
        </nav>
        <header className="hq__header">
          <div>
            <p className="eyebrow">Shadow Section · Account</p>
            <h1 className="title">{session.user.name}</h1>
            <p className="hint">{session.user.email}</p>
          </div>
        </header>
        <section className="panel" aria-labelledby="data-title">
          <h2 id="data-title">Your data</h2>
          <p>
            The game stores your campaign progress, mission results, saved games, generated operations and settings. Nothing is
            shared with other players.
          </p>
        </section>
        <DeleteAccount />
      </div>
    </main>
  );
}
