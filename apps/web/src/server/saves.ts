import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { type SavePayload, savePayloadSchema, SAVE_MAX_JSON_BYTES, SAVE_SCHEMA_VERSION, type SaveSlotId, type SaveSummary } from '@operation-shadow/schemas';
import { readSave } from '@operation-shadow/db';
import { ApiProblem } from './api';
import { getDb } from './db';

export const checksumOf = (json: string) => createHash('sha256').update(json, 'utf8').digest('hex');

/**
 * Older save formats are upgraded step by step here before validation (plan §9.3). Version 1 is
 * the first format, so the chain is empty for now; a v2 would add `1: (p) => ({ ...p, version: 2 })`.
 */
const MIGRATIONS: Record<number, (payload: Record<string, unknown>) => Record<string, unknown>> = {};

export function migrateSave(raw: unknown): unknown {
  let payload = raw as Record<string, unknown>;
  for (let guard = 0; guard < 10 && typeof payload?.version === 'number' && payload.version < SAVE_SCHEMA_VERSION; guard += 1) {
    const step = MIGRATIONS[payload.version];
    if (!step) break;
    payload = step(payload);
  }
  return payload;
}

/** Decompresses (bounded), parses and validates an uploaded save. */
export function decodeUpload(gzip: Buffer): { payload: SavePayload; json: string } {
  let json: string;
  try {
    json = gunzipSync(gzip, { maxOutputLength: SAVE_MAX_JSON_BYTES }).toString('utf8');
  } catch (err) {
    if (err instanceof RangeError) throw new ApiProblem('payload_too_large', 'The save is too large');
    throw new ApiProblem('bad_request', 'The save must be gzip-compressed JSON');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ApiProblem('bad_request', 'The save is not valid JSON');
  }
  const parsed = savePayloadSchema.safeParse(migrateSave(raw));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiProblem('bad_request', `Invalid save: ${first ? `${first.path.join('.')}: ${first.message}` : 'unknown problem'}`.slice(0, 200));
  }
  return { payload: parsed.data, json };
}

/** Reads a stored revision; null when it is damaged (bad gzip, checksum mismatch or invalid). */
export function decodeStored(revision: { payload: Buffer; checksum: string }): SavePayload | null {
  try {
    const json = gunzipSync(revision.payload, { maxOutputLength: SAVE_MAX_JSON_BYTES }).toString('utf8');
    if (checksumOf(json) !== revision.checksum) return null;
    const parsed = savePayloadSchema.safeParse(migrateSave(JSON.parse(json)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function summarize(slot: SaveSlotId, payload: SavePayload, updatedAt: Date): SaveSummary {
  return {
    slot,
    missionKey: payload.missionKey,
    missionTitle: payload.missionTitle,
    seconds: Math.round(payload.state.tick / 20),
    objectivesDone: payload.state.objectives.filter((o) => o.status === 'completed').length,
    objectivesTotal: payload.state.objectives.filter((o) => o.status !== 'hidden').length,
    squad: payload.setup.squad,
    difficulty: payload.setup.difficulty,
    updatedAt: updatedAt.toISOString(),
  };
}

/** Re-compresses canonical JSON for storage (the upload is never stored as sent). */
export const compress = (json: string) => gzipSync(Buffer.from(json, 'utf8'), { level: 6 });

/** The newest intact revision of a slot (older ones are tried if it is damaged). */
export async function loadSave(ownerId: string, slot: SaveSlotId): Promise<{ payload: SavePayload; recovered: boolean; savedAt: Date } | 'missing' | 'damaged'> {
  const save = await readSave(getDb().db, ownerId, slot);
  if (!save) return 'missing';
  for (const [i, revision] of save.revisions.entries()) {
    const payload = decodeStored(revision);
    if (payload) return { payload, recovered: i > 0, savedAt: revision.createdAt };
  }
  return 'damaged';
}
