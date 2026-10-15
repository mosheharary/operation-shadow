import { getMission, SPECIALIST_PROFILES } from '@operation-shadow/content';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/server/session';
import { SquadPicker } from './squad-picker';
import styles from './briefing.module.css';

// Session-dependent: always rendered per request.
export const dynamic = 'force-dynamic';

type Params = Promise<{ key: string }>;
type Search = Promise<{ error?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { key } = await params;
  return { title: getMission(key)?.title ?? 'Mission' };
}

export default async function BriefingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireSession();
  const { key } = await params;
  const { error } = await searchParams;
  const entry = getMission(key);
  if (!entry) notFound();
  const b = entry.briefing;

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.crumbs}>
          <Link href="/dashboard">Field HQ</Link> / <span>Briefing</span>
        </nav>
        <header className={styles.header}>
          <p className="eyebrow">
            {b.location} · {b.time} · {b.weather}
          </p>
          <h1 className="title">{b.codename}</h1>
        </header>

        <div className={styles.grid}>
          <article className={styles.dossier}>
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-generated dossier art, served as-is */}
            <img src={b.dossierImage} alt={`Reconnaissance sketch for ${entry.title}`} className={styles.dossierImage} width={1024} height={576} />
            <section>
              <h2>Situation</h2>
              {b.premise.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </section>
            <section>
              <h2>Intelligence</h2>
              <ul>
                {b.intel.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
            <section className={styles.warnings} aria-labelledby="warnings-title">
              <h2 id="warnings-title">Rules of engagement</h2>
              <ul>
                {b.warnings.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
            <dl className={styles.facts}>
              <div>
                <dt>Insertion</dt>
                <dd>{b.insertion}</dd>
              </div>
              <div>
                <dt>Extraction</dt>
                <dd>{b.extraction}</dd>
              </div>
            </dl>
          </article>

          <SquadPicker
            missionKey={entry.key}
            squad={entry.squad}
            recommended={b.recommended}
            profiles={Object.values(SPECIALIST_PROFILES)}
            initialError={typeof error === 'string' ? error.slice(0, 200) : null}
          />
        </div>
      </div>
    </main>
  );
}
