'use client';

import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { type Operative, spyCoverIntact, TICK_RATE, type World } from '@operation-shadow/engine';
import { focusOn } from '../camera/camera-rig';
import { primaryKey, SELECT_ACTIONS } from '../input/bindings';
import { useHudTick } from '../runtime/game-context';
import { type Sightline, sightlines, watchByOperative } from '../runtime/sightlines';
import { useGameUi } from '../runtime/store';
import { Icon, type IconName } from './icons';
import styles from './hud.module.css';

/** What the chip says while a sentry is sizing this operative up, by how far he has got. */
const WATCH_TEXT = { watch: 'Being watched', suspect: 'Suspicious', close: 'About to be spotted', seen: 'Spotted' } as const;

function statusOf(op: Operative, world: World, watch: Sightline | undefined): { icon: IconName; text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } | null {
  const tick = world.state.tick;
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
  if (watch && !watch.seeing) return { icon: 'eye', text: 'Out of sight', tone: 'warn' };
  if (watch) return { icon: 'eye', text: WATCH_TEXT[watch.stage], tone: watch.stage === 'close' || watch.stage === 'seen' ? 'danger' : 'warn' };
  if (op.noticedBy.length > 0) return { icon: 'eye', text: 'Being watched', tone: 'warn' };
  if (op.submerged) return { icon: 'wave', text: 'Submerged', tone: 'ok' };
  if (op.role === 'spy') return spyCoverIntact(world, op) ? { icon: 'mask', text: 'Under cover', tone: 'ok' } : { icon: 'alert', text: 'Cover blown', tone: 'danger' };
  if (op.disguised) return { icon: 'mask', text: op.suspiciousUntil > tick ? 'Cover at risk' : 'Disguised', tone: op.suspiciousUntil > tick ? 'warn' : 'ok' };
  return null;
}

export function PortraitBar() {
  const controller = useHudTick();
  const selected = useGameUi((s) => s.selected);
  const select = useGameUi((s) => s.select);
  const { state } = controller.world;
  const watched = watchByOperative(sightlines(state));

  return (
    <ol className={styles.portraits} aria-label="Squad">
      {state.operatives.map((op, index) => {
        const profile = SPECIALIST_PROFILES[op.role];
        const watch = watched.get(op.id);
        const status = statusOf(op, controller.world, watch);
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
              data-tip={`${profile.callSign}, ${profile.roleLabel}: click to select (Shift adds), double-click to look (${primaryKey(SELECT_ACTIONS[index]!)})`}
              data-tip-pos="below"
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
                <span
                  className={`${styles.chip} ${styles[`chip_${status.tone}`]} ${watch ? styles.chipWatch : ''}`}
                  style={watch ? { ['--watch' as string]: `${Math.round(watch.level * 100)}%` } : undefined}
                  data-testid={watch ? `watch-${op.role}` : undefined}
                >
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
