'use client';

import type { Guard, GuardStateName } from '@operation-shadow/engine';
import { useHudTick } from '../runtime/game-context';
import { useGameUi } from '../runtime/store';
import styles from './hud.module.css';

const STATE_LABELS: Record<GuardStateName, string> = {
  post: 'On post',
  patrol: 'Patrolling',
  observe: 'Watching something',
  suspicious: 'Suspicious',
  investigate: 'Investigating',
  search: 'Searching',
  challenge: 'Challenging',
  alerted: 'Alerted',
  combat: 'Engaging',
  return: 'Returning to post',
  escort: 'Escorting a prisoner',
  revive: 'Waking a comrade',
  distracted: 'Distracted',
};

const RANKS = { soldier: 'Soldier', nco: 'Sergeant', officer: 'Officer' } as const;
const TEMPERAMENTS = { passive: 'Lax', standard: 'Steady', strict: 'Strict', aggressive: 'Aggressive' } as const;

function describe(g: Guard): string {
  if (g.status === 'ko') return 'Unconscious';
  if (g.status === 'restrained') return 'Tied up';
  if (g.status === 'dead') return 'Dead';
  return STATE_LABELS[g.state];
}

/** Details for the hovered (or last pinned) soldier, with the cone toggle reminder. */
export function EnemyInfo() {
  const controller = useHudTick();
  const hovered = useGameUi((s) => s.hovered);
  const pinned = useGameUi((s) => s.pinnedCones);
  const id = hovered?.kind === 'guard' ? hovered.id : pinned.at(-1);
  const g = id ? controller.world.guard(id) : undefined;
  if (!g) return null;
  const suspicion = g.suspicion.reduce((m, e) => Math.max(m, e.value), 0);
  return (
    <aside className={styles.enemy} aria-label="Enemy soldier" data-testid="enemy-info">
      <h2 className={styles.panelTitle}>
        {RANKS[g.rank]} <span className={styles.muted}>· {TEMPERAMENTS[g.temperament]}</span>
      </h2>
      <p className={styles.enemyState}>{describe(g)}</p>
      {g.status === 'active' && (
        <div className={styles.meter} aria-label={`Suspicion ${Math.round(suspicion)} of 100`}>
          <span style={{ width: `${Math.min(100, suspicion)}%` }} />
        </div>
      )}
      <ul className={styles.enemyFacts}>
        {g.radio && <li>Carries a radio</li>}
        {g.carriesLantern && <li>Carries a lantern</li>}
        {g.eyeElevation > 0 && <li>Elevated post</li>}
        {g.rank === 'officer' && <li>Sees through disguises up close</li>}
      </ul>
      <p className={styles.hintSmall}>{pinned.includes(g.id) ? 'Cone pinned · click to unpin' : 'Click to pin his view cone · hold Alt for all'}</p>
    </aside>
  );
}
