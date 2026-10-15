'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import type { RenderSample } from './perf-probe';

// WebGL only runs in the browser; the scene module is never rendered on the server.
const TestRangeScene = dynamic(() => import('./scene').then((m) => m.TestRangeScene), {
  ssr: false,
  loading: () => <p className="loading">Loading 3D scene…</p>,
});

export function TestRange() {
  const [sample, setSample] = useState<RenderSample | null>(null);

  return (
    <div className="range">
      <header className="range__bar">
        <h1>Test range</h1>
        <Link href="/dashboard">Back to Field HQ</Link>
      </header>
      <div className="range__viewport">
        <div className="range__canvas">
          <TestRangeScene onSample={setSample} />
        </div>
        <dl className="perf" aria-label="Performance">
          <dt>FPS</dt>
          <dd data-testid="perf-fps">{sample?.fps ?? '–'}</dd>
          <dt>Draw calls</dt>
          <dd>{sample?.drawCalls ?? '–'}</dd>
          <dt>Triangles</dt>
          <dd>{sample ? sample.triangles.toLocaleString() : '–'}</dd>
        </dl>
      </div>
    </div>
  );
}
