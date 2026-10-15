import type { Database } from '../client';
import { auditEvents } from '../schema/app';

export type AuditKind = 'dev_login' | 'sign_in' | 'sign_out' | 'account_deleted' | 'save_deleted' | 'campaign_deleted';

export async function recordAuditEvent(
  db: Database,
  event: { userId: string | null; kind: AuditKind; metadata?: Record<string, unknown> },
): Promise<void> {
  await db.insert(auditEvents).values({ userId: event.userId, kind: event.kind, metadata: event.metadata ?? {} });
}
