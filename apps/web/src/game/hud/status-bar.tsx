'use client';

import { ALARM_LABELS, type AlarmLevel, TICK_RATE } from '@operation-shadow/engine';
import { useHudTick } from '../runtime/game-context';
import { Icon, type IconName } from './icons';
import styles from './hud.module.css';

const LEVEL_ICONS: Record<AlarmLevel, IconName> = { 0: 'check', 1: 'eye', 2: 'search', 3: 'alert', 4: 'alert' };

export function formatClock(ticks: number): string {
  const total = Math.floor(ticks / TICK_RATE);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Alarm ladder, mission clock and simulation speed. The alarm uses icon, text and position, not colour alone. */
export function StatusBar() {
  const controller = useHudTick();
  const { state, mission } = { state: controller.world.state, mission: controller.mission };
  const level = state.alarm.level;
  const watched = state.operatives.some((op) => op.status === 'active' && op.noticedBy.length > 0);
  const limit = mission.failAtAlarm;

  return (
    <div className={styles.status}>
      <div className={styles.alarm} role="status" aria-live="polite" aria-label={`Alarm: ${ALARM_LABELS[level]}`} data-testid="alarm-level" data-level={level}>
        <ol className={styles.ladder} aria-hidden="true">
          {([0, 1, 2, 3, 4] as AlarmLevel[]).map((l) => (
            <li key={l} className={`${styles.rung} ${l <= level ? styles[`rung_${l}`] : ''} ${limit !== null && l >= limit ? styles.rungLimit : ''}`} />
          ))}
        </ol>
        <span className={`${styles.alarmLabel} ${styles[`alarm_${level}`]}`}>
          <Icon name={LEVEL_ICONS[level]} size={14} />
          {ALARM_LABELS[level]}
          {state.alarm.sirens && ' · sirens'}
        </span>
      </div>
      {watched && (
        <span className={`${styles.chip} ${styles.chip_warn}`} data-testid="watched">
          <Icon name="eye" size={12} /> Someone is watching
        </span>
      )}
      <span className={styles.clock}>
        <Icon name="clock" size={14} /> {formatClock(state.tick)}
      </span>
      {controller.speed !== 1 && <span className={styles.speed}>×{controller.speed}</span>}
      {controller.paused && state.status === 'running' && (
        <span className={styles.paused} data-testid="paused">
          <Icon name="pause" size={14} /> Tactical pause · orders still work
        </span>
      )}
    </div>
  );
}
