'use client';

import { useEffect, useState } from 'react';
import { useSettings } from '../runtime/settings';
import styles from './hud.module.css';

/** Frame rate and renderer load, sampled by the scene's performance probe (toggle with F3). */
export function PerfReadout() {
  const enabled = useSettings((s) => s.showFps);
  const [sample, setSample] = useState(() => (typeof window === 'undefined' ? undefined : window.__OS_RENDER__));
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setSample(window.__OS_RENDER__), 500);
    return () => window.clearInterval(timer);
  }, [enabled]);
  if (!enabled || !sample) return null;
  return (
    <p className={styles.perf} data-testid="perf-readout">
      {sample.fps} FPS · {sample.drawCalls} draws · {Math.round(sample.triangles / 1000)}k tris
    </p>
  );
}
