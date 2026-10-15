import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { user } from '../schema/auth';
import { campaigns, missionRuns, saveRevisions, saveSlots } from '../schema/progress';

export type CampaignRow = typeof campaigns.$inferSelect;
export type RunRow = typeof missionRuns.$inferSelect;
export type SaveSlotRow = typeof saveSlots.$inferSelect;

/** Recovery depth: the newest revisions kept per slot. */
export const SAVE_REVISIONS_KEPT = 3;

// Every function takes the owner's id from the authenticated session and scopes by it.

// ── Campaigns ──────────────────────────────────────────────────────────────────────────────────

export async function listCampaigns(db: Database, ownerId: string): Promise<CampaignRow[]> {
  return db.select().from(campaigns).where(eq(campaigns.ownerId, ownerId)).orderBy(desc(campaigns.updatedAt));
}

export async function getCampaign(db: Database, ownerId: string, id: string): Promise<CampaignRow | null> {
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, ownerId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCampaign(db: Database, ownerId: string, input: { name: string; difficulty: string; progress: Record<string, unknown> }): Promise<CampaignRow> {
  const [row] = await db.insert(campaigns).values({ ownerId, ...input }).returning();
  return row!;
}

/** The campaign the player last played, created on first use. */
export async function getOrCreateActiveCampaign(db: Database, ownerId: string, defaults: { name: string; difficulty: string; progress: Record<string, unknown> }): Promise<CampaignRow> {
  const existing = await db.select().from(campaigns).where(eq(campaigns.ownerId, ownerId)).orderBy(desc(campaigns.updatedAt)).limit(1);
  return existing[0] ?? createCampaign(db, ownerId, defaults);
}

/**
 * Applies a change to a campaign's progress with optimistic concurrency (retried on a version
 * clash, so two tabs finishing missions at once both count).
 */
export async function updateCampaignProgress(
  db: Database,
  ownerId: string,
  id: string,
  change: (progress: Record<string, unknown>) => Record<string, unknown>,
): Promise<CampaignRow | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await getCampaign(db, ownerId, id);
    if (!current) return null;
    const rows = await db
      .update(campaigns)
      .set({ progress: change(structuredClone(current.progress)), version: current.version + 1, updatedAt: sql`now()` })
      .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, ownerId), eq(campaigns.version, current.version)))
      .returning();
    if (rows[0]) return rows[0];
  }
  throw new Error('Campaign is being updated elsewhere; try again');
}

export async function setCampaignDifficulty(db: Database, ownerId: string, id: string, difficulty: string): Promise<CampaignRow | null> {
  const rows = await db
    .update(campaigns)
    .set({ difficulty, version: sql`${campaigns.version} + 1`, updatedAt: sql`now()` })
    .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, ownerId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteCampaign(db: Database, ownerId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, ownerId)))
    .returning({ id: campaigns.id });
  return rows.length > 0;
}

// ── Mission runs ───────────────────────────────────────────────────────────────────────────────

export async function startMissionRun(
  db: Database,
  ownerId: string,
  input: { campaignId: string | null; missionKey: string; squad: string[]; difficulty: string; seed: number },
): Promise<RunRow> {
  const [row] = await db.insert(missionRuns).values({ ownerId, ...input }).returning();
  return row!;
}

/** Finishes a running attempt once; returns null if it is not this owner's or already finished. */
export async function completeMissionRun(
  db: Database,
  ownerId: string,
  runId: string,
  result: { outcome: string; score: number | null; rank: string | null; medals: string[]; durationSeconds: number; stats: Record<string, number> },
): Promise<RunRow | null> {
  const rows = await db
    .update(missionRuns)
    .set({ ...result, completedAt: sql`now()` })
    .where(and(eq(missionRuns.id, runId), eq(missionRuns.ownerId, ownerId), eq(missionRuns.outcome, 'running')))
    .returning();
  return rows[0] ?? null;
}

export async function listMissionRuns(db: Database, ownerId: string, limit = 20): Promise<RunRow[]> {
  return db.select().from(missionRuns).where(eq(missionRuns.ownerId, ownerId)).orderBy(desc(missionRuns.startedAt)).limit(limit);
}

// ── Saves ──────────────────────────────────────────────────────────────────────────────────────

export async function listSaveSlots(db: Database, ownerId: string): Promise<SaveSlotRow[]> {
  return db.select().from(saveSlots).where(eq(saveSlots.ownerId, ownerId)).orderBy(desc(saveSlots.updatedAt));
}

/**
 * Writes a new revision and moves the slot pointer in one transaction, then prunes revisions
 * beyond the recovery depth. A crash at any point leaves the previous save intact.
 */
export async function writeSave(
  db: Database,
  ownerId: string,
  input: { slot: string; missionKey: string; summary: Record<string, unknown>; schemaVersion: number; payload: Buffer; checksum: string; sizeBytes: number },
): Promise<SaveSlotRow> {
  return db.transaction(async (tx) => {
    const [slot] = await tx
      .insert(saveSlots)
      .values({ ownerId, slot: input.slot, missionKey: input.missionKey, summary: input.summary })
      .onConflictDoUpdate({ target: [saveSlots.ownerId, saveSlots.slot], set: { missionKey: input.missionKey, summary: input.summary, updatedAt: sql`now()` } })
      .returning();
    const [revision] = await tx
      .insert(saveRevisions)
      .values({ slotId: slot!.id, ownerId, schemaVersion: input.schemaVersion, payload: input.payload, checksum: input.checksum, sizeBytes: input.sizeBytes })
      .returning({ id: saveRevisions.id });
    const [updated] = await tx.update(saveSlots).set({ currentRevisionId: revision!.id }).where(eq(saveSlots.id, slot!.id)).returning();
    const keep = await tx
      .select({ id: saveRevisions.id })
      .from(saveRevisions)
      .where(eq(saveRevisions.slotId, slot!.id))
      .orderBy(desc(saveRevisions.createdAt), desc(saveRevisions.id))
      .limit(SAVE_REVISIONS_KEPT);
    await tx.delete(saveRevisions).where(
      and(
        eq(saveRevisions.slotId, slot!.id),
        notInArray(
          saveRevisions.id,
          keep.map((k) => k.id),
        ),
      ),
    );
    return updated!;
  });
}

/** A slot and its revisions, the current one first (then older ones for recovery). */
export async function readSave(db: Database, ownerId: string, slot: string) {
  const slots = await db
    .select()
    .from(saveSlots)
    .where(and(eq(saveSlots.ownerId, ownerId), eq(saveSlots.slot, slot)))
    .limit(1);
  const row = slots[0];
  if (!row) return null;
  const revisions = await db
    .select()
    .from(saveRevisions)
    .where(and(eq(saveRevisions.slotId, row.id), eq(saveRevisions.ownerId, ownerId)))
    .orderBy(desc(saveRevisions.createdAt), desc(saveRevisions.id));
  revisions.sort((a, b) => (a.id === row.currentRevisionId ? -1 : b.id === row.currentRevisionId ? 1 : 0));
  return { slot: row, revisions };
}

export async function deleteSave(db: Database, ownerId: string, slot: string): Promise<boolean> {
  const rows = await db
    .delete(saveSlots)
    .where(and(eq(saveSlots.ownerId, ownerId), eq(saveSlots.slot, slot)))
    .returning({ id: saveSlots.id });
  return rows.length > 0;
}

// ── Account ────────────────────────────────────────────────────────────────────────────────────

/** Deletes the user; sessions, campaigns, runs, saves, jobs and generated missions cascade. */
export async function deleteUserAccount(db: Database, userId: string): Promise<boolean> {
  const rows = await db.delete(user).where(eq(user.id, userId)).returning({ id: user.id });
  return rows.length > 0;
}
