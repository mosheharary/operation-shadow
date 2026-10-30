'use client';

import { type Medal, scoreMission, TICK_RATE } from '@operation-shadow/engine';
import { useEffect, useRef } from 'react';
import { useHudTick } from '../runtime/game-context';
import { canRecall, openRecall } from '../runtime/recall-session';
import { useGameUi } from '../runtime/store';
import { AfterActionChart } from './after-action';
import type { MenuCallbacks } from './menus';
import { presentText } from './present';
import { formatClock } from './status-bar';
import styles from './hud.module.css';

const MEDALS: Record<Medal, { name: string; text: string }> = {
  ghost: { name: 'Ghost', text: 'Never detected' },
  restraint: { name: 'Restraint', text: 'No enemy killed' },
  untouchable: { name: 'Untouchable', text: 'No injuries or captures' },
  thorough: { name: 'Thorough', text: 'Every optional objective' },
  swift: { name: 'Swift', text: 'Under par time' },
};

/** End-of-mission report built from the real statistics; nothing here is invented for flavour. */
export function Debrief({ onRestart, onExit }: MenuCallbacks) {
  const controller = useHudTick();
  const { state } = controller.world;
  const first = useRef<HTMLButtonElement>(null);
  // The report waits for the closing shot's verdict (skippable) before it comes up.
  const closing = useGameUi((s) => s.cinematic?.kind === 'outro');
  const recalling = useGameUi((s) => s.recall !== null);
  const over = state.status !== 'running' && !closing && !recalling;
  useEffect(() => {
    if (over) first.current?.focus();
  }, [over]);
  if (!over) return null;

  const score = scoreMission(state, controller.mission);
  const st = state.stats;
  const success = state.status === 'success';
  const stats: [string, string | number][] = [
    ['Mission time', `${formatClock(state.tick)} (par ${formatClock(controller.mission.parSeconds * TICK_RATE)})`],
    ['Times spotted', st.detections],
    ['Highest alarm', st.peakAlarm],
    ['Knocked out', st.knockouts],
    ['Tied up', st.restrained],
    ['Killed', st.kills],
    ['Bodies found by the enemy', st.bodiesFound],
    ['Shots fired', st.shotsFired],
    ['Squad injuries', st.injuries],
  ];
  if (controller.recalls > 0) stats.push(['Wound back on the field recorder', controller.recalls]);
  const rewindable = !success && canRecall(controller);

  return (
    <div className={styles.modalBackdrop}>
      <div className={`${styles.modal} ${styles.modalWide} ${styles.debriefModal}`} role="dialog" aria-modal="true" aria-labelledby="debrief-title" data-testid="debrief" data-outcome={state.status}>
        <p className="eyebrow">{controller.entry.title} · Debrief</p>
        <h2 id="debrief-title" className={styles.modalTitle}>
          {success ? 'Mission complete' : 'Mission failed'}
        </h2>
        <p className={styles.debriefText}>{success ? controller.entry.debrief.success : controller.entry.debrief.failure}</p>
        {state.outcome && !success && <p className={styles.debriefReason}>{presentText(state.outcome.message)}</p>}
        <div className={styles.debriefLayout}>
          <AfterActionChart />
          <div className={styles.debriefGrid}>
            {success && (
              <section>
                <h3>
                  Score {score.score} · Rank {score.rank}
                </h3>
                <table className={styles.breakdown}>
                  <tbody>
                    {score.breakdown.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {score.medals.length > 0 && (
                  <ul className={styles.medals}>
                    {score.medals.map((m) => (
                      <li key={m}>
                        <strong>{MEDALS[m].name}</strong> {MEDALS[m].text}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            <section>
              <h3>Field report</h3>
              <table className={styles.breakdown}>
                <tbody>
                  {stats.map(([label, value]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </div>
        <div className={styles.menuButtons}>
          {rewindable && (
            <button ref={first} type="button" className={styles.primaryButton} onClick={() => openRecall(controller)} data-testid="debrief-recall" data-tip="Wind the last minute back on the field recorder and play it differently">
              Wind back
            </button>
          )}
          <button ref={rewindable ? undefined : first} type="button" className={rewindable ? styles.button : styles.primaryButton} onClick={onRestart} data-tip="Play this mission again from the start">
            {success ? 'Play again' : 'Retry mission'}
          </button>
          <button type="button" className={styles.button} onClick={onExit} data-tip="Back to the mission briefing">
            Back to briefing
          </button>
        </div>
      </div>
    </div>
  );
}
