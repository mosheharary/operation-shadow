import { randomInt } from 'node:crypto';
import { checkSquad, getMission, parseSquad } from '@operation-shadow/content';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireSession } from '@/server/session';
import { PlayLoader } from './play-loader';

// Session-dependent: always rendered per request.
export const dynamic = 'force-dynamic';

type Params = Promise<{ key: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { key } = await params;
  return { title: getMission(key)?.title ?? 'Mission' };
}

const MAX_SEED = 2 ** 31 - 1;

export default async function PlayPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requireSession();
  const { key } = await params;
  const query = await searchParams;
  const entry = getMission(key);
  if (!entry) notFound();

  const squad = parseSquad(typeof query.squad === 'string' ? query.squad : '');
  const problem = checkSquad(entry, squad);
  if (problem) redirect(`/missions/${entry.key}?error=${encodeURIComponent(problem)}`);
  const difficulty = query.difficulty === 'veteran' ? 'veteran' : 'standard';
  // A seed in the URL replays the same simulation (used by tests and for sharing a run).
  const requested = typeof query.seed === 'string' && /^\d{1,10}$/.test(query.seed) ? Number(query.seed) : NaN;
  const seed = Number.isInteger(requested) && requested > 0 && requested <= MAX_SEED ? requested : randomInt(1, MAX_SEED);

  return <PlayLoader setup={{ missionKey: entry.key, squad, difficulty, seed }} title={entry.title} />;
}
