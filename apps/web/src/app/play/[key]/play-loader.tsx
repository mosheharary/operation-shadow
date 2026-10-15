'use client';

import dynamic from 'next/dynamic';
import type { GameSetup } from '@/game/runtime/controller';

function Loading({ title }: { title: string }) {
  return (
    <div className="game-loading" role="status">
      <p className="eyebrow">Shadow Section</p>
      <p className="game-loading__title">{title}</p>
      <p className="hint">Preparing the operation…</p>
    </div>
  );
}

// WebGL and the simulation only run in the browser.
const PlaySession = dynamic(() => import('@/game/play-session').then((m) => m.PlaySession), {
  ssr: false,
  loading: () => <Loading title="Loading" />,
});

export function PlayLoader({ setup, title }: { setup: GameSetup; title: string }) {
  return <PlaySession setup={setup} title={title} fallback={<Loading title={title} />} />;
}
