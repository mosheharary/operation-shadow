'use client';

import { useHudTick } from '../runtime/game-context';
import { Icon } from './icons';
import styles from './hud.module.css';

export function ObjectivesPanel() {
  const controller = useHudTick();
  const { state } = controller.world;
  const defs = controller.mission.objectives;
  const requiredDone = defs.filter((d) => d.required).every((d) => state.objectives.find((o) => o.id === d.id)?.status === 'completed');

  return (
    <section className={styles.objectives} aria-labelledby="objectives-title">
      <h2 id="objectives-title" className={styles.panelTitle}>
        Objectives
      </h2>
      <ul>
        {defs.map((def) => {
          const status = state.objectives.find((o) => o.id === def.id)?.status ?? 'hidden';
          if (status === 'hidden') return null;
          return (
            <li key={def.id} className={`${styles.objective} ${styles[`objective_${status}`]}`} data-testid={`objective-${def.id}`} data-status={status}>
              <Icon name={status === 'completed' ? 'check' : status === 'failed' ? 'x' : 'diamond'} size={14} />
              <span>
                <strong>{def.title}</strong>
                {!def.required && <em className={styles.optional}> optional</em>}
                <span className={styles.objectiveDesc}>{def.description}</span>
              </span>
            </li>
          );
        })}
        <li className={`${styles.objective} ${requiredDone ? styles.objective_active : styles.objective_pending}`}>
          <Icon name="exit" size={14} />
          <span>
            <strong>Extract</strong>
            <span className={styles.objectiveDesc}>
              {requiredDone ? `Bring every surviving squad member here: ${controller.entry.briefing.extraction}` : `Complete the required objectives, then extract: ${controller.entry.briefing.extraction}`}
            </span>
          </span>
        </li>
      </ul>
    </section>
  );
}
