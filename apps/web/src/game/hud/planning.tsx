'use client';

import { ABILITY_INFO, SPECIALIST_PROFILES } from '@operation-shadow/content';
import { type Action, operativeSpeed, type Operative, type Vec2 } from '@operation-shadow/engine';
import { primaryKey } from '../input/bindings';
import { useHudTick } from '../runtime/game-context';
import styles from './hud.module.css';

interface Step {
  label: string;
  wait: boolean;
}

/** Plain description of an order with a rough duration (straight-line distance at the current gait). */
function describe(action: Action, from: Vec2, op: Operative): { step: Step; end: Vec2 } {
  switch (action.kind) {
    case 'move': {
      const metres = Math.hypot(action.target.x - from.x, action.target.z - from.z);
      const secs = Math.max(1, Math.round(metres / operativeSpeed(op.stance, action.gait, false)));
      return { step: { label: `${action.gait === 'run' ? 'Run' : 'Move'} ~${secs} s`, wait: false }, end: action.target };
    }
    case 'approach':
      return { step: { label: ABILITY_INFO[action.abilityId].name, wait: false }, end: from };
    case 'channel':
      return { step: { label: `${ABILITY_INFO[action.abilityId].name} (${Math.ceil(action.remaining / 20)} s)`, wait: false }, end: from };
    case 'converse':
      return { step: { label: 'Talking', wait: false }, end: from };
    case 'wait-signal':
      return { step: { label: 'Wait for signal', wait: true }, end: from };
  }
}

/**
 * Planning mode timeline (plan §3.12): one row per specialist with the current and queued orders,
 * the abort rule, and the signal button. Shown while paused or while a plan is waiting.
 */
export function PlanningPanel() {
  const controller = useHudTick();
  const { state } = controller.world;
  const active = state.operatives.filter((op) => op.status === 'active');
  const planning = active.some((op) => op.action?.kind === 'wait-signal' || op.queue.length > 0) || controller.world.pendingCommands().some((c) => c.type === 'hold');
  if (state.status !== 'running' || (!controller.paused && !planning)) return null;
  const waiting = active.some((op) => op.action?.kind === 'wait-signal') || controller.world.pendingCommands().some((c) => c.type === 'hold');

  return (
    <section className={styles.planning} aria-labelledby="planning-title" data-testid="planning">
      <h2 id="planning-title" className={styles.panelTitle}>
        Plan
      </h2>
      <p className={styles.planningHint}>
        Shift + right-click queues orders. {primaryKey('hold')} adds “wait for signal”; {primaryKey('signal')} gives the signal.
      </p>
      <ol className={styles.timeline}>
        {active.map((op) => {
          let steps: Step[] = [];
          let from = op.pos;
          for (const action of [op.action, ...op.queue]) {
            if (!action) continue;
            const { step, end } = describe(action, from, op);
            steps.push(step);
            from = end;
          }
          // Orders given while paused apply at the next tick: preview them in order.
          for (const cmd of controller.world.pendingCommands()) {
            if (cmd.type === 'signal' || cmd.type === 'stance' || cmd.type === 'abort-rule') continue;
            if (cmd.type === 'ability' ? cmd.unitId !== op.id : !cmd.unitIds.includes(op.id)) continue;
            if (cmd.type === 'stop') {
              steps = [];
              continue;
            }
            const action: Action =
              cmd.type === 'hold'
                ? { kind: 'wait-signal' }
                : cmd.type === 'move'
                  ? { kind: 'move', path: [], index: 0, gait: cmd.gait, target: cmd.target, linkProgress: 0 }
                  : { kind: 'approach', abilityId: cmd.abilityId, target: cmd.target, path: [], index: 0, gait: cmd.gait ?? 'walk', repathTick: 0, linkProgress: 0 };
            const { step, end } = describe(action, from, op);
            if (!('queue' in cmd && cmd.queue)) steps = [];
            steps.push(step);
            from = end;
          }
          return (
            <li key={op.id} data-testid={`plan-${op.id}`}>
              <strong>{SPECIALIST_PROFILES[op.role].callSign}</strong>
              <span className={styles.steps}>
                {steps.length === 0 ? (
                  <em>Idle</em>
                ) : (
                  steps.map((s, i) => (
                    <span key={i} className={s.wait ? styles.stepWait : styles.step}>
                      {s.label}
                    </span>
                  ))
                )}
              </span>
              <select
                aria-label={`Abort rule for ${SPECIALIST_PROFILES[op.role].callSign}`}
                value={op.abortRule?.on ?? 'none'}
                onChange={(e) => controller.command({ type: 'abort-rule', unitIds: [op.id], rule: e.target.value as 'none' | 'spotted' | 'alarm' })}
              >
                <option value="none">No abort</option>
                <option value="spotted">Abort if spotted</option>
                <option value="alarm">Abort on alarm</option>
              </select>
            </li>
          );
        })}
      </ol>
      <div className={styles.planningActions}>
        <button type="button" className={styles.primaryButton} disabled={!waiting} onClick={() => controller.command({ type: 'signal' })} data-testid="signal" data-tip="Everyone waiting for the signal moves at once">
          Signal ({primaryKey('signal')})
        </button>
        {[0.5, 1, 2].map((speed) => (
          <button
            key={speed}
            type="button"
            className={controller.speed === speed ? styles.primaryButton : styles.button}
            data-tip={speed === 1 ? 'Normal game speed' : speed < 1 ? 'Half speed: more time to react' : 'Double speed: skip the waiting'}
            onClick={() => {
              controller.speed = speed;
              controller.notifyHud();
            }}
          >
            ×{speed}
          </button>
        ))}
      </div>
    </section>
  );
}
