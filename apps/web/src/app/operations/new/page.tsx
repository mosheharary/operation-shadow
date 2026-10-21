import type { Metadata } from 'next';
import Link from 'next/link';
import { configuredProvider } from '@/server/generation';
import { requireSession } from '@/server/session';
import { GenerateOperation } from './generate-operation';
import styles from './operations.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New operation' };

export default async function NewOperationPage() {
  await requireSession();
  const provider = configuredProvider();
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.crumbs}>
          <Link href="/dashboard">Field HQ</Link> / <span>New operation</span>
        </nav>
        <header>
          <p className="eyebrow">Shadow Section · Generated operation</p>
          <h1 className="title">Request an operation</h1>
          <p className="lede">
            Tell Lantern what kind of job you want. Every operation gets a map of its own, laid out fresh, and is checked before you
            see it: objectives must exist on the map, and there must be a route to finish it without being seen.
          </p>
        </header>
        <GenerateOperation aiAvailable={provider !== 'disabled'} />
      </div>
    </main>
  );
}
