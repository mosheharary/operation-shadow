'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

const AssetScene = dynamic(() => import('./asset-scene').then((m) => m.AssetScene), {
  ssr: false,
  loading: () => <p className="loading">Loading models…</p>,
});

/** Visual check of every authored prop model beside the procedural model it replaces. */
export function AssetGallery() {
  return (
    <div className="range">
      <header className="range__bar">
        <h1>Models</h1>
        <p className="hint">Back row: authored (High preset). Front row: procedural (Performance, and the fallback).</p>
        <Link href="/test-range/characters">Characters</Link>
        <Link href="/test-range">3D test range</Link>
      </header>
      <div className="range__viewport">
        <div className="range__canvas">
          <AssetScene />
        </div>
      </div>
    </div>
  );
}
