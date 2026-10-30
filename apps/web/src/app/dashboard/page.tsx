import type { Metadata } from 'next';
import Link from 'next/link';
import { CAMPAIGN } from '@operation-shadow/content';
import { checkReadiness, listOwnedMissions, listSaveSlots } from '@operation-shadow/db';
import { saveSummarySchema } from '@operation-shadow/schemas';
import { getDb } from '@/server/db';
import { activeCampaign, readProgress } from '@/server/progress';
import { requireSession } from '@/server/session';
import { DeleteButton } from './delete-button';
import { SignOutButton } from './sign-out-button';
import { theatreStops } from './theatre';
import { TheatreMap } from './theatre-map';

// Session-dependent: always rendered per request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Field HQ' };

const statusClass = (value: string) =>
  value === 'ok' ? 'status-tag status-tag--ok' : value === 'pending' ? 'status-tag status-tag--pending' : 'status-tag status-tag--error';

const SLOT_NAME: Record<string, string> = { quick: 'Quicksave', auto: 'Autosave', 'manual-1': 'Slot 1', 'manual-2': 'Slot 2', 'manual-3': 'Slot 3' };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const { error } = await searchParams;
  const campaign = await activeCampaign(session.user.id).catch(() => null);
  const progress = readProgress(campaign?.progress);
  const firstTimer = Object.keys(progress.completed).length === 0;
  const stops = theatreStops(CAMPAIGN, progress.completed);
  const saves = (await listSaveSlots(getDb().db, session.user.id).catch(() => []))
    .map((s) => saveSummarySchema.safeParse({ ...s.summary, slot: s.slot, updatedAt: s.updatedAt.toISOString() }))
    .flatMap((r) => (r.success ? [r.data] : []));
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
            <Link href="/account" className="btn btn--ghost">
              Account
            </Link>
            <SignOutButton />
          </div>
        </header>

        {typeof error === 'string' && (
          <p className="alert" role="alert">
            {error.slice(0, 200)}
          </p>
        )}
        <div className="hq__grid">
          <nav className="menu" aria-label="Main menu">
            {saves.length > 0 && (
              <section className="menu__group" aria-labelledby="continue-title" data-testid="continue">
                <h2 id="continue-title" className="menu__heading">
                  Continue
                </h2>
                {saves.slice(0, 3).map((save) => (
                  <div key={save.slot} className="menu__row">
                    <Link className="menu__item" href={`/play/${save.missionKey}?save=${save.slot}`} data-testid={`continue-${save.slot}`}>
                      <span className="menu__title">
                        {save.missionTitle} · {SLOT_NAME[save.slot]}
                      </span>
                      <span className="menu__desc">
                        {Math.floor(save.seconds / 60)} min in · {save.objectivesDone}/{save.objectivesTotal} objectives · saved {save.updatedAt.slice(0, 16).replace('T', ' ')} UTC
                      </span>
                    </Link>
                    <DeleteButton url={`/api/v1/saves/${save.slot}`} label={`${save.missionTitle} · ${SLOT_NAME[save.slot]}`} testId={`delete-save-${save.slot}`} />
                  </div>
                ))}
              </section>
            )}
            <h2 className="menu__heading">{campaign?.name ?? 'Campaign'}</h2>
            {CAMPAIGN.map((mission, i) => {
              const done = progress.completed[mission.key];
              return (
                <Link
                  key={mission.key}
                  className={`menu__item${firstTimer && i === 0 ? ' menu__item--accent' : ''}`}
                  href={`/missions/${mission.key}`}
                  data-testid={`mission-${mission.key}`}
                  data-theatre-key={mission.key}
                >
                  <span className="menu__title">
                    {mission.tutorial ? 'Training' : `Operation ${i}`}: {mission.title}
                    {firstTimer && i === 0 && <span className="menu__badge">Start here</span>}
                    {done && (
                      <span className="menu__badge menu__badge--done" data-testid={`done-${mission.key}`}>
                        ✓ Rank {done.bestRank}
                      </span>
                    )}
                  </span>
                  <span className="menu__desc">{mission.summary}</span>
                </Link>
              );
            })}
            <h2 className="menu__heading">Generated operations</h2>
            <Link className="menu__item menu__item--accent" href="/operations/new" data-testid="new-operation">
              <span className="menu__title">Request a generated operation</span>
              <span className="menu__desc">Lantern drafts a fresh mission on any map, checked to be winnable without being seen.</span>
            </Link>
            {generated.map((m) => (
              <div key={m.id} className="menu__row">
                <Link className={`menu__item${m.hasImage ? ' menu__item--sketch' : ''}`} href={`/missions/op-${m.id}`} data-testid="generated-mission">
                  {m.hasImage && (
                    // eslint-disable-next-line @next/next/no-img-element -- private per-user image served by the API
                    <img className="menu__sketch" src={`/api/v1/missions/${m.id}/image`} alt="" width={128} height={72} loading="lazy" />
                  )}
                  <span className="menu__title">Operation: {m.title}</span>
                  <span className="menu__desc">
                    Generated {m.createdAt.toISOString().slice(0, 10)} · {m.source === 'fallback' ? 'offline generator' : 'drafted by Lantern (AI)'}
                  </span>
                </Link>
                <DeleteButton url={`/api/v1/missions/${m.id}`} label={`Operation: ${m.title}`} testId={`delete-operation-${m.id}`} />
              </div>
            ))}
            <Link className="menu__item" href="/test-range">
              <span className="menu__title">Test range</span>
              <span className="menu__desc">3D rendering check: terrain, lighting, shadows and a live performance readout.</span>
            </Link>
          </nav>

          <aside className="panel hq__theatre" aria-labelledby="theatre-title">
            <h2 id="theatre-title">Theatre of operations</h2>
            <TheatreMap stops={stops} />
            <ul className="hq__systems" aria-label="System status">
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
