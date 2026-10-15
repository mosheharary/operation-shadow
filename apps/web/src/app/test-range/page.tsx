import type { Metadata } from 'next';
import { TestRange } from '@/game/render/test-range/test-range';
import { requireSession } from '@/server/session';

// Session-dependent: always rendered per request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Test range' };

export default async function TestRangePage() {
  await requireSession();
  return <TestRange />;
}
