'use client';

import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { type Operative, TICK_RATE } from '@operation-shadow/engine';
import { focusOn } from '../camera/camera-rig';
import { primaryKey, SELECT_ACTIONS } from '../input/bindings';
import { useHudTick } from '../runtime/game-context';
import { useGameUi } from '../runtime/store';
import { Icon, type IconName } from './icons';
import styles from './hud.module.css';

function statusOf(op: Operative, tick: number): { icon: IconName; text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } | null {
  switch (op.status) {
    case 'downed':
      return { icon: 'cross', text: op.bleedOut > 0 ? `Downed ${Math.ceil(op.bleedOut / TICK_RATE)}s` : 'Downed', tone: 'danger' };
    case 'dead':
      return { icon: 'x', text: 'Killed', tone: 'danger' };
    case 'captured':
      return { icon: 'lock', text: 'Captured', tone: 'danger' };
    case 'extracted':
      return { icon: 'exit', text: 'Extracted', tone: 'muted' };
    default:
      break;
  }
  if (op.noticedBy.length > 0) return { icon: 'eye', text: 'Being watched', tone: 'warn' };
  if (op.submerged) return { icon: 'wave', text: 'Submerged', tone: 'ok' };
  if (op.disguised) return { icon: 'mask', text: op.suspiciousUntil > tick ? 'Cover at risk' : 'Disguised', tone: op.suspiciousUntil > tick ? 'warn' : 'ok' };
  return null;
}

export function PortraitBar() {
  const controller = useHudTick();
  const selected = useGameUi((s) => s.selected);
  const select = useGameUi((s) => s.select);
  const { state } = controller.world;

  return (
    <ol className={styles.portraits} aria-label="Squad">
      {state.operatives.map((op, index) => {
        const profile = SPECIALIST_PROFILES[op.role];
        const status = statusOf(op, state.tick);
        const isSelected = selected.includes(op.id);
        const health = Math.max(0, op.health / op.maxHealth);
        const unavailable = op.status === 'dead' || op.status === 'extracted';
        return (
          <li key={op.id}>
            <button
              type="button"
              className={`${styles.portrait} ${isSelected ? styles.portraitSelected : ''} ${unavailable ? styles.portraitOut : ''}`}
              style={{ ['--accent' as string]: profile.color }}
              aria-pressed={isSelected}
              aria-label={`${profile.callSign}, ${profile.roleLabel}${status ? `, ${status.text}` : ''}`}
              data-testid={`portrait-${op.role}`}
              disabled={unavailable}
              onClick={(e) => select([op.id], e.shiftKey)}
              onDoubleClick={() => {
                select([op.id]);
                focusOn(op.pos);
              }}
            >
              <span className={styles.portraitKey}>{primaryKey(SELECT_ACTIONS[index]!)}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- static portraits; no optimisation pipeline needed in-game */}
              <img src={profile.portrait} alt="" width={64} height={64} className={styles.portraitImg} draggable={false} />
              <span className={styles.portraitName}>{profile.callSign}</span>
              <span className={styles.health} aria-hidden="true">
                <span className={styles.healthFill} style={{ width: `${health * 100}%`, background: health < 0.35 ? 'var(--rust)' : health < 0.7 ? 'var(--brass)' : 'var(--moss)' }} />
              </span>
              {status && (
                <span className={`${styles.chip} ${styles[`chip_${status.tone}`]}`}>
                  <Icon name={status.icon} size={12} />
                  {status.text}
                </span>
              )}
              {op.carrying && <span className={styles.portraitBadge}>Carrying</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
