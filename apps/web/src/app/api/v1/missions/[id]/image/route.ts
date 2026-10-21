import { getMissionImage } from '@operation-shadow/db';
import { ApiProblem, handle, requireApiSession, requireUuid } from '@/server/api';
import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/** The dossier sketch of one of the player's generated operations. It never changes once drawn. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireApiSession();
    const id = requireUuid((await params).id);
    const image = await getMissionImage(getDb().db, session.user.id, id);
    if (!image) throw new ApiProblem('not_found', 'Not found');
    return new Response(new Uint8Array(image.data), {
      headers: { 'content-type': image.contentType, 'cache-control': 'private, max-age=31536000, immutable', 'content-length': String(image.data.length) },
    });
  });
}
