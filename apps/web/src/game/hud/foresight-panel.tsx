'use client';

import { useEffect, useRef } from 'react';
import { FORESIGHT_SECONDS, foresightClock } from '../runtime/foresight';
import { useGameUi } from '../runtime/store';
import { Icon } from './icons';
import styles from './hud.module.css';

/**
 * The paused game's foresight, in words: the verdict on the next ten seconds ("OWL spotted in
 * 4.5 s", or nobody sees the squad), the trouble on the way, and a strip with the ghosts' playhead
 * on it.
 */
export function ForesightPanel() {
  const foresight = useGameUi((s) => s.foresight);
  const head = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const seconds = foresight?.seconds ?? 0;
  const shown = foresight !== null;

  // The playhead follows the ghosts on every animation frame without re-rendering React.
  useEffect(() => {
    if (!shown) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = foresightClock.t ?? 0;
      if (head.current) head.current.style.left = `${(t / FORESIGHT_SECONDS) * 100}%`;
      if (clock.current) clock.current.textContent = `+${t.toFixed(1)} s`;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  if (!foresight) return null;
  return (
    <section className={styles.foresight} data-tone={foresight.tone} aria-label="Foresight" data-testid="foresight">
      <header>
        <Icon name={foresight.tone === 'clear' ? 'eye' : 'alert'} size={14} />
        <span className={styles.foresightTitle}>Foresight · if you resume now</span>
        <span ref={clock} className={styles.foresightClock} />
      </header>
      <p className={styles.foresightVerdict} role="status" data-testid="foresight-verdict">
        {foresight.text}
      </p>
      <div className={styles.foresightStrip} aria-hidden="true">
        {/* Past a sighting the future depends on what the squad does about it: the strip is cut there. */}
        {seconds < FORESIGHT_SECONDS && <b className={styles.foresightCut} style={{ left: `${(seconds / FORESIGHT_SECONDS) * 100}%` }} />}
        {foresight.incidents.map((incident, i) => (
          <i key={i} data-kind={incident.kind} style={{ left: `${(incident.seconds / FORESIGHT_SECONDS) * 100}%` }} />
        ))}
        <span ref={head} className={styles.foresightHead} />
      </div>
      {foresight.incidents.length > 1 && (
        <ol className={styles.foresightList}>
          {foresight.incidents.map((incident, i) => (
            <li key={i} data-kind={incident.kind}>
              <time>{incident.seconds.toFixed(1)} s</time> {incident.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Cools and greys the world behind the HUD while foresight shows, like a planning table. */
export function ForesightTint() {
  const shown = useGameUi((s) => s.foresight !== null);
  return shown ? <div className={styles.foresightTint} aria-hidden="true" data-testid="foresight-tint" /> : null;
}
