import { deleteUserAccount, recordAuditEvent } from '@operation-shadow/db';
import { deleteAccountSchema } from '@operation-shadow/schemas';
import { createHash } from 'node:crypto';
import { handle, json, readJson, requireApiSession, requireSameOrigin } from '@/server/api';
import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/**
 * Permanently deletes the signed-in account and everything it owns (cascades). The audit entry
 * keeps only a one-way hash of the user id.
 */
export async function POST(request: Request) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    await readJson(request, deleteAccountSchema);
    const { db } = getDb();
    const subject = createHash('sha256').update(session.user.id).digest('hex').slice(0, 16);
    await deleteUserAccount(db, session.user.id);
    await recordAuditEvent(db, { userId: null, kind: 'account_deleted', metadata: { subject } });
    const response = json({ deleted: true });
    // The session row is gone with the user; clear the cookies too.
    for (const name of ['better-auth.session_token', '__Secure-better-auth.session_token', 'better-auth.session_data', '__Secure-better-auth.session_data']) {
      response.headers.append('set-cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${name.startsWith('__Secure') ? '; Secure' : ''}`);
    }
    return response;
  });
}
