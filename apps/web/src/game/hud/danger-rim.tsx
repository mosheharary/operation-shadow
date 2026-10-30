'use client';

import { useEffect, useRef } from 'react';
import { useSettings } from '../runtime/settings';
import { heartbeatInterval, rimFrame, type SightlineStage } from '../runtime/sightlines';
import { Icon } from './icons';
import styles from './hud.module.css';

const SLOTS = 4;

const STAGE_TEXT: Record<SightlineStage, string> = {
  watch: 'A sentry is looking this way',
  suspect: 'A sentry is suspicious',
  close: 'A sentry is about to raise the alarm',
  seen: 'Spotted',
};

/**
 * The squad's peripheral sense of being watched: the screen edge darkens and throbs with the
 * strongest live sightline, and a sentry watching from out of view gets an eye on the edge pointing
 * at him, its ring filling as he makes up his mind. Reads the overlay's rim frame on every
 * animation frame and writes styles directly, so it never re-renders React.
 */
export function DangerRim() {
  const root = useRef<HTMLDivElement>(null);
  const marks = useRef<(HTMLDivElement | null)[]>([]);
  const enabled = useSettings((s) => s.showSightlines);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let shown = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = root.current;
      if (!el) return;
      const danger = rimFrame.danger;
      // Quantised so the style only changes when the danger visibly does.
      const step = Math.round(danger * 20) / 20;
      if (step !== shown) {
        shown = step;
        el.style.setProperty('--danger', String(step));
        const beat = heartbeatInterval(danger);
        el.style.setProperty('--beat', `${beat ?? 1.4}s`);
        el.dataset.level = danger >= 0.75 ? 'close' : danger >= 0.45 ? 'suspect' : danger > 0 ? 'watch' : 'calm';
      }
      for (let i = 0; i < SLOTS; i += 1) {
        const mark = marks.current[i];
        if (!mark) continue;
        const m = rimFrame.markers[i];
        if (!m) {
          if (mark.dataset.on !== '0') mark.dataset.on = '0';
          continue;
        }
        mark.dataset.on = '1';
        mark.dataset.stage = m.stage;
        mark.style.transform = `translate(${m.x}px, ${m.y}px)`;
        mark.style.setProperty('--angle', `${m.angle}rad`);
        mark.style.setProperty('--fill', `${Math.round(m.level * 100)}%`);
        mark.title = STAGE_TEXT[m.stage];
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div ref={root} className={styles.dangerRim} data-testid="danger-rim" data-level="calm" aria-hidden="true">
      <div className={styles.dangerVignette} />
      {Array.from({ length: SLOTS }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            marks.current[i] = el;
          }}
          className={styles.watcherMark}
          data-on="0"
          data-testid="watcher-mark"
        >
          <span className={styles.watcherArrow} />
          <span className={styles.watcherRing}>
            <Icon name="eye" size={16} />
          </span>
        </div>
      ))}
    </div>
  );
}
