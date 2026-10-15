import type { Metadata } from 'next';
import Link from 'next/link';
import { MISSIONS } from '@operation-shadow/content';
import { checkReadiness, listOwnedMissions } from '@operation-shadow/db';
import { getDb } from '@/server/db';
import { requireSession } from '@/server/session';
import { SignOutButton } from './sign-out-button';

// Session-dependent: always rendered per request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Field HQ' };

const statusClass = (value: string) =>
  value === 'ok' ? 'status-tag status-tag--ok' : value === 'pending' ? 'status-tag status-tag--pending' : 'status-tag status-tag--error';

// Milestones from docs/architecture/implementation-plan.md; only built features appear in the menu.
const ROADMAP = [
  { label: 'Foundation: accounts, database, 3D pipeline', state: 'ok' },
  { label: 'Vertical slice: playable mission "Silent Tide"', state: 'ok' },
  { label: 'Campaign of six missions with a guided tutorial', state: 'ok' },
  { label: 'Generated operations (Gemini, with offline fallback)', state: 'ok' },
  { label: 'Campaigns and saved games', state: 'pending' },
  { label: 'Full campaign, planning mode, polish', state: 'pending' },
] as const;

export default async function DashboardPage() {
  const session = await requireSession();
  const readiness = await checkReadiness(getDb().pool).catch(() => ({ database: 'error', migrations: 'error' }) as const);
  const generated = await listOwnedMissions(getDb().db, session.user.id, 6).catch(() => []);

  return (
    <main className="hq">
      <div className="hq__inner">
        <header className="hq__header">
          <div>
            <p className="eyebrow">Shadow Section · Field HQ</p>
            <h1 className="title">Operation Shadow</h1>
          </div>
          <div className="hq__operator">
            <span>
              Signed in as <strong>{session.user.name}</strong>
            </span>
            <SignOutButton />
          </div>
        </header>

        <div className="hq__grid">
          <nav className="menu" aria-label="Main menu">
            {Object.values(MISSIONS).map((mission) => (
              <Link key={mission.key} className="menu__item" href={`/missions/${mission.key}`} data-testid={`mission-${mission.key}`}>
                <span className="menu__title">Operation: {mission.title}</span>
                <span className="menu__desc">{mission.summary}</span>
              </Link>
            ))}
            <Link className="menu__item menu__item--accent" href="/operations/new" data-testid="new-operation">
              <span className="menu__title">Request a generated operation</span>
              <span className="menu__desc">Lantern drafts a fresh mission on any map, checked to be winnable without being seen.</span>
            </Link>
            {generated.map((m) => (
              <Link key={m.id} className="menu__item" href={`/missions/op-${m.id}`} data-testid="generated-mission">
                <span className="menu__title">Operation: {m.title}</span>
                <span className="menu__desc">
                  Generated {m.createdAt.toISOString().slice(0, 10)} · {m.source === 'fallback' ? 'offline generator' : 'drafted by Lantern (AI)'}
                </span>
              </Link>
            ))}
            <Link className="menu__item" href="/test-range">
              <span className="menu__title">Test range</span>
              <span className="menu__desc">3D rendering check: terrain, lighting, shadows and a live performance readout.</span>
            </Link>
          </nav>

          <aside className="panel" aria-labelledby="status-title">
            <h2 id="status-title">Build status</h2>
            <ul className="checklist">
              {ROADMAP.map((item) => (
                <li key={item.label}>
                  <span className={statusClass(item.state)}>{item.state === 'ok' ? 'Done' : 'Next'}</span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
            <h2>Systems</h2>
            <ul className="checklist" aria-label="System status">
              <li>
                <span className={statusClass(readiness.database)}>{readiness.database}</span>
                <span>Database</span>
              </li>
              <li>
                <span className={statusClass(readiness.migrations)}>{readiness.migrations}</span>
                <span>Migrations</span>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </main>
  );
}
