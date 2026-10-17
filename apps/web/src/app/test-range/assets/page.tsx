import type { Metadata } from 'next';
import { AssetGallery } from '@/game/render/test-range/asset-gallery';
import { requireSession } from '@/server/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Models' };

export default async function AssetsPage() {
  await requireSession();
  return <AssetGallery />;
}
