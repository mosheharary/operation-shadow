'use client';

import { ABILITY_INFO, SPECIALIST_PROFILES } from '@operation-shadow/content';
import { ABILITIES, type AbilityId, type Operative, type Stance, TICK_RATE } from '@operation-shadow/engine';
import { primaryKey, SLOT_ACTIONS } from '../input/bindings';
import { abilityBar } from '../input/context-action';
import { useHudTick } from '../runtime/game-context';
import { useGameUi } from '../runtime/store';
import { Icon } from './icons';
import styles from './hud.module.css';

const STANCES: { stance: Stance; label: string; action: 'stand' | 'crouch' | 'prone' }[] = [
  { stance: 'stand', label: 'Stand', action: 'stand' },
  { stance: 'crouch', label: 'Crouch', action: 'crouch' },
  { stance: 'prone', label: 'Prone', action: 'prone' },
];

function itemCount(op: Operative, abilityId: AbilityId): number | null {
  const item = ABILITIES[abilityId].item;
  return item ? (op.inventory[item] ?? 0) : null;
}

/** Context hint, stance controls and the selected specialist's ability slots. */
export function AbilityBar() {
  const controller = useHudTick();
  const selected = useGameUi((s) => s.selected);
  const targeting = useGameUi((s) => s.targeting);
  const hint = useGameUi((s) => s.contextHint);
  const setTargeting = useGameUi((s) => s.setTargeting);
  const toast = useGameUi((s) => s.toast);
  const world = controller.world;
  const lead = selected.map((id) => world.operative(id)).find((op) => op && op.status === 'active');

  if (!lead) {
    return (
      <div className={styles.bottom}>
        <p className={styles.hintIdle}>Select a squad member: click a portrait, press 1–{world.state.operatives.length}, or drag a box.</p>
      </div>
    );
  }

  const profile = SPECIALIST_PROFILES[lead.role];
  const slots = abilityBar(lead);
  const unitIds = selected.filter((id) => world.operative(id)?.status === 'active');

  const activate = (abilityId: AbilityId) => {
    if (ABILITIES[abilityId].target === 'self') {
      const result = controller.command({ type: 'ability', unitId: lead.id, abilityId, target: { kind: 'self' } });
      if (!result.ok) toast(result.message);
      return;
    }
    setTargeting(targeting === abilityId ? null : abilityId);
  };

  return (
    <div className={styles.bottom}>
      <div className={styles.hintLine} aria-live="polite" data-testid="context-hint">
        {hint ? (
          <>
            <span className={hint.ok ? styles.hintOk : styles.hintBad}>
              <Icon name={hint.ok ? 'check' : 'x'} size={13} />
              {targeting ? `${hint.label}: ${hint.ok ? 'left-click to confirm' : hint.message}` : `Right-click: ${hint.label}`}
            </span>
            {!hint.ok && !targeting && hint.message && <span className={styles.hintReason}>{hint.message}</span>}
          </>
        ) : targeting ? (
          <span className={styles.hintOk}>{ABILITY_INFO[targeting].name}: choose a target · right-click or Esc to cancel</span>
        ) : null}
      </div>
      <div className={styles.abilityBar} role="toolbar" aria-label={`${profile.callSign} actions`}>
        <div className={styles.unitTag} style={{ ['--accent' as string]: profile.color }}>
          <strong>{profile.callSign}</strong>
          <span>{profile.roleLabel}</span>
          {unitIds.length > 1 && <span className={styles.groupNote}>+{unitIds.length - 1} more</span>}
        </div>
        <div className={styles.stances} role="group" aria-label="Stance">
          {STANCES.map(({ stance, label, action }) => (
            <button
              key={stance}
              type="button"
              className={`${styles.slot} ${styles.stanceSlot} ${lead.stance === stance ? styles.slotActive : ''}`}
              aria-pressed={lead.stance === stance}
              onClick={() => {
                const result = controller.command({ type: 'stance', unitIds, stance });
                if (!result.ok) toast(result.message);
              }}
            >
              <span className={styles.slotKey}>{primaryKey(action)}</span>
              <span className={styles.slotName}>{label}</span>
            </button>
          ))}
        </div>
        <div className={styles.slots}>
          {slots.map((abilityId, i) => {
            const info = ABILITY_INFO[abilityId];
            const count = itemCount(lead, abilityId);
            const cooldown = lead.cooldowns[abilityId] ?? 0;
            const empty = count !== null && count <= 0;
            return (
              <button
                key={abilityId}
                type="button"
                className={`${styles.slot} ${targeting === abilityId ? styles.slotActive : ''} ${info.lethal ? styles.slotLethal : ''}`}
                disabled={empty || cooldown > 0}
                aria-pressed={targeting === abilityId}
                title={`${info.name}: ${info.description}${info.lethal ? ' (lethal)' : ''}${info.loud ? ' (loud)' : ''}`}
                data-testid={`ability-${abilityId}`}
                onClick={() => activate(abilityId)}
              >
                <span className={styles.slotKey}>{primaryKey(SLOT_ACTIONS[i]!)}</span>
                <span className={styles.slotName}>{info.name}</span>
                {count !== null && <span className={styles.slotCount}>{count}</span>}
                {info.lethal && <span className={styles.slotTag}>lethal</span>}
                {cooldown > 0 && <span className={styles.slotCooldown}>{Math.ceil(cooldown / TICK_RATE)}s</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
