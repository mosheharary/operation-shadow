'use client';

import { useHudTick } from '../runtime/game-context';
import { presentText } from './present';
import { formatClock } from './status-bar';
import styles from './hud.module.css';

export function EventLog() {
  const controller = useHudTick();
  const entries = controller.world.state.log.slice(-6);
  if (entries.length === 0) return null;
  return (
    <section className={styles.log} aria-label="Event log">
      <ol>
        {entries.map((entry, i) => (
          <li key={`${entry.tick}-${i}`} className={styles[`log_${entry.kind}`]}>
            <time>{formatClock(entry.tick)}</time> {presentText(entry.text)}
          </li>
        ))}
      </ol>
    </section>
  );
}
