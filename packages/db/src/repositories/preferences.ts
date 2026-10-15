import { eq, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { userPreferences } from '../schema/app';

export interface StoredPreferences {
  schemaVersion: number;
  settings: Record<string, unknown>;
}

// Every repository function takes the owner's id from the authenticated session, so a caller can
// only ever read or write its own rows.

export async function getPreferences(db: Database, ownerId: string): Promise<StoredPreferences | null> {
  const rows = await db
    .select({ schemaVersion: userPreferences.schemaVersion, settings: userPreferences.settings })
    .from(userPreferences)
    .where(eq(userPreferences.userId, ownerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function savePreferences(db: Database, ownerId: string, value: StoredPreferences): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId: ownerId, schemaVersion: value.schemaVersion, settings: value.settings })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { schemaVersion: value.schemaVersion, settings: value.settings, updatedAt: sql`now()` },
    });
}
