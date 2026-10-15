'use client';

import { useEffect, useState } from 'react';
import { useSettings } from '../runtime/settings';
import { useGameUi } from '../runtime/store';
import { Icon } from './icons';
import styles from './hud.module.css';

/** Re-renders while timed messages are on screen so expired ones disappear even when paused. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function Subtitles() {
  const subtitles = useGameUi((s) => s.subtitles);
  const enabled = useSettings((s) => s.subtitles);
  const now = useNow(subtitles.length > 0);
  const live = subtitles.filter((s) => s.until > now).slice(-2);
  if (!enabled || live.length === 0) return null;
  return (
    <div className={styles.subtitles} aria-live="polite" data-testid="subtitles">
      {live.map((line) => (
        <p key={line.id}>
          <strong>{line.speaker}:</strong> {line.text}
        </p>
      ))}
    </div>
  );
}

export function Toasts() {
  const toasts = useGameUi((s) => s.toasts);
  const now = useNow(toasts.length > 0);
  const live = toasts.filter((t) => now - t.at < 2600);
  if (live.length === 0) return null;
  return (
    <div className={styles.toasts} role="status" aria-live="assertive" data-testid="toasts">
      {live.map((t) => (
        <p key={t.id} className={styles[`toast_${t.kind}`]}>
          <Icon name={t.kind === 'info' ? 'check' : 'alert'} size={14} />
          {t.text}
        </p>
      ))}
    </div>
  );
}

export function DragBox() {
  const box = useGameUi((s) => s.dragBox);
  if (!box) return null;
  return (
    <div
      className={styles.dragBox}
      style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
    />
  );
}
