import { listSaveSlots } from '@operation-shadow/db';
import { saveSummarySchema } from '@operation-shadow/schemas';
import { handle, json, requireApiSession } from '@/server/api';
import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/** The player's save slots with player-facing summaries. */
export async function GET() {
  return handle(async () => {
    const session = await requireApiSession();
    const slots = await listSaveSlots(getDb().db, session.user.id);
    return json({ saves: slots.map((s) => saveSummarySchema.parse({ ...s.summary, slot: s.slot, updatedAt: s.updatedAt.toISOString() })) });
  });
}
