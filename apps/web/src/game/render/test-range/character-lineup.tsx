'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import type { LineupPose } from './character-scene';

const CharacterScene = dynamic(() => import('./character-scene').then((m) => m.CharacterScene), {
  ssr: false,
  loading: () => <p className="loading">Loading characters…</p>,
});

const POSES: LineupPose[] = ['stand', 'walk', 'run', 'crouch', 'prone', 'aim'];

/** Visual check of every character model: the squad, each guard rank, the prisoner and the disguise. */
export function CharacterLineup() {
  const [pose, setPose] = useState<LineupPose>('stand');
  return (
    <div className="range">
      <header className="range__bar">
        <h1>Characters</h1>
        <nav className="range__poses" aria-label="Pose">
          {POSES.map((p) => (
            <button key={p} type="button" className={p === pose ? 'btn btn--primary range__pose' : 'btn range__pose'} onClick={() => setPose(p)} data-testid={`pose-${p}`}>
              {p}
            </button>
          ))}
        </nav>
        <Link href="/test-range">3D test range</Link>
      </header>
      <div className="range__viewport">
        <div className="range__canvas">
          <CharacterScene pose={pose} />
        </div>
      </div>
    </div>
  );
}
