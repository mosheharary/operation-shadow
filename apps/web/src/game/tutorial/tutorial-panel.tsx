'use client';

import { useEffect, useState } from 'react';
import { getBindings } from '../input/bindings';
import { useHudTick } from '../runtime/game-context';
import { useGameUi } from '../runtime/store';
import { advanceTutorial, type TutorialContext, TUTORIAL_STEPS } from './script';
import styles from './tutorial.module.css';

type Used = TutorialContext['used'] extends ReadonlySet<infer T> ? T : never;

/**
 * The guided Boot Camp panel: one instruction at a time, advancing when the player does it.
 * It also publishes the current marker so the scene can draw it on the ground.
 */
export function TutorialPanel() {
  const controller = useHudTick();
  const selected = useGameUi((s) => s.selected);
  const [step, setStep] = useState(0);
  const [hidden, setHidden] = useState(false);
  // Mutated by the input listeners below; read by step conditions.
  const [used] = useState(() => new Set<Used>());

  useEffect(() => {
    const b = getBindings();
    const pan = [...b['pan-up'], ...b['pan-down'], ...b['pan-left'], ...b['pan-right']];
    const key = (e: KeyboardEvent) => {
      if (pan.includes(e.code)) used.add('pan');
      if ([...b['rotate-left'], ...b['rotate-right']].includes(e.code)) used.add('rotate');
      if (e.key === 'Alt') used.add('cones');
      if (b.pause.includes(e.code)) used.add('pause');
    };
    const wheel = () => used.add('zoom');
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', wheel);
    };
  }, [used]);

  // Auto-advance past every step whose goal is met, checked on each HUD tick and selection change.
  useEffect(() => {
    const check = () =>
      setStep((current) => {
        if (!TUTORIAL_STEPS[current]?.done) return current;
        return advanceTutorial(TUTORIAL_STEPS, current, { world: controller.world, selected: useGameUi.getState().selected, used });
      });
    const offHud = controller.subscribeHud(check);
    const offUi = useGameUi.subscribe(check);
    return () => {
      offHud();
      offUi();
    };
  }, [controller, used]);

  const ctx: TutorialContext = { world: controller.world, selected, used };
  const current = TUTORIAL_STEPS[step]!;
  useEffect(() => {
    useGameUi.getState().setTutorialMarker(TUTORIAL_STEPS[step]?.marker ?? null);
    return () => useGameUi.getState().setTutorialMarker(null);
  }, [step]);

  if (hidden) {
    return (
      <button type="button" className={styles.reopen} onClick={() => setHidden(false)}>
        Show tutorial
      </button>
    );
  }
  const hint = current.hint?.(ctx) ?? null;
  return (
    <aside className={styles.panel} aria-label="Tutorial" aria-live="polite" data-testid="tutorial" data-step={current.id}>
      <p className={styles.progress}>
        Training · step {step + 1} of {TUTORIAL_STEPS.length}
      </p>
      <h2 className={styles.title}>{current.title}</h2>
      <p className={styles.text}>{current.text()}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
      <div className={styles.actions}>
        {!current.done && step < TUTORIAL_STEPS.length - 1 && (
          <button type="button" className={styles.primary} onClick={() => setStep(step + 1)} data-testid="tutorial-continue">
            Continue
          </button>
        )}
        <button type="button" className={styles.secondary} onClick={() => setHidden(true)}>
          Hide
        </button>
        {step > 0 && step < TUTORIAL_STEPS.length - 1 && (
          <button type="button" className={styles.secondary} onClick={() => setStep(TUTORIAL_STEPS.length - 1)}>
            Skip tutorial
          </button>
        )}
      </div>
    </aside>
  );
}
