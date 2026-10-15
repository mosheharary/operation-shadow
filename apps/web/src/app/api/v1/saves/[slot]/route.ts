import { deleteSave, recordAuditEvent, writeSave } from '@operation-shadow/db';
import { SAVE_MAX_COMPRESSED_BYTES, SAVE_SCHEMA_VERSION, saveSlotSchema } from '@operation-shadow/schemas';
import { ApiProblem, handle, json, requireApiSession, requireSameOrigin } from '@/server/api';
import { getDb } from '@/server/db';
import { resolveMission } from '@/server/missions';
import { checksumOf, compress, decodeUpload, loadSave, summarize } from '@/server/saves';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slot: string }> };

async function slotOf(params: Params['params']) {
  const parsed = saveSlotSchema.safeParse((await params).slot);
  if (!parsed.success) throw new ApiProblem('not_found', 'Not found');
  return parsed.data;
}

/** Saves the game: the body is gzip-compressed save JSON. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const slot = await slotOf(params);
    if (Number(request.headers.get('content-length') ?? 0) > SAVE_MAX_COMPRESSED_BYTES) throw new ApiProblem('payload_too_large', 'The save is too large');
    const body = Buffer.from(await request.arrayBuffer());
    if (body.length > SAVE_MAX_COMPRESSED_BYTES) throw new ApiProblem('payload_too_large', 'The save is too large');
    const { payload } = decodeUpload(body);
    // The mission must be one this player can play (campaign, or their own generated operation).
    if (!(await resolveMission(payload.missionKey, session.user.id))) throw new ApiProblem('bad_request', 'Unknown mission');
    const canonical = JSON.stringify(payload);
    const stored = compress(canonical);
    const row = await writeSave(getDb().db, session.user.id, {
      slot,
      missionKey: payload.missionKey,
      summary: summarize(slot, payload, new Date()) as unknown as Record<string, unknown>,
      schemaVersion: SAVE_SCHEMA_VERSION,
      payload: stored,
      checksum: checksumOf(canonical),
      sizeBytes: stored.length,
    });
    return json({ save: summarize(slot, payload, row.updatedAt) });
  });
}

/** Loads the newest intact revision; a damaged one falls back to the previous (reported as recovered). */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const session = await requireApiSession();
    const slot = await slotOf(params);
    const result = await loadSave(session.user.id, slot);
    if (result === 'missing') throw new ApiProblem('not_found', 'Not found');
    if (result === 'damaged') throw new ApiProblem('conflict', 'This save is damaged and could not be recovered');
    return json({ save: summarize(slot, result.payload, result.savedAt), payload: result.payload, recovered: result.recovered });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const slot = await slotOf(params);
    if (!(await deleteSave(getDb().db, session.user.id, slot))) throw new ApiProblem('not_found', 'Not found');
    await recordAuditEvent(getDb().db, { userId: session.user.id, kind: 'save_deleted', metadata: { slot } });
    return json({ deleted: slot });
  });
}
