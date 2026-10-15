import { getPreferences, savePreferences } from '@operation-shadow/db';
import { PREFERENCES_VERSION, preferencesSchema } from '@operation-shadow/schemas';
import { handle, json, readJson, requireApiSession, requireSameOrigin } from '@/server/api';
import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/** Settings that follow the player between browsers. */
export async function GET() {
  return handle(async () => {
    const session = await requireApiSession();
    const prefs = await getPreferences(getDb().db, session.user.id);
    return json({ preferences: prefs ?? { schemaVersion: PREFERENCES_VERSION, settings: {} } });
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    requireSameOrigin(request);
    const session = await requireApiSession();
    const body = await readJson(request, preferencesSchema, 20 * 1024);
    await savePreferences(getDb().db, session.user.id, body);
    return json({ preferences: body });
  });
}
