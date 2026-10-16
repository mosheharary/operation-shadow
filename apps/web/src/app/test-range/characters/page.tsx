import type { Metadata } from 'next';
import { CharacterLineup } from '@/game/render/test-range/character-lineup';
import { requireSession } from '@/server/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Characters' };

export default async function CharactersPage() {
  await requireSession();
  return <CharacterLineup />;
}
