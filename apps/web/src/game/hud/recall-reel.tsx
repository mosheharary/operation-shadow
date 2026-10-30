'use client';

import { TICK_RATE } from '@operation-shadow/engine';
import { useEffect } from 'react';
import { useHudTick } from '../runtime/game-context';
import { type RecallMark, undoneMarks } from '../runtime/recall';
import { cancelRecall, previewRecall, recallPresentTick, resumeRecall } from '../runtime/recall-session';
import { useGameUi } from '../runtime/store';
import { formatClock } from './status-bar';
import styles from './hud.module.css';

const worst = (marks: readonly RecallMark[]): RecallMark['kind'] | undefined =>
  marks.find((m) => m.kind === 'danger')?.kind ?? marks.find((m) => m.kind === 'warning')?.kind ?? marks[0]?.kind;

/**
 * The field recorder: a sepia film strip of the last minute. The world itself winds back to the
 * frame on screen, the trouble that followed it is listed, and play resumes from there in
 * tactical pause. ← → wind, Enter resumes, Esc returns to the present.
 */
export function RecallReel() {
  const controller = useHudTick();
  const recall = useGameUi((s) => s.recall);

  // Keys belong to the recorder while it is open: captured on window so the game never sees them.
  const open = recall !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key) || /^F\d+$/.test(e.code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const index = useGameUi.getState().recall?.index ?? 0;
      const last = controller.tape.frames.length - 1;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') previewRecall(controller, index - 1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') previewRecall(controller, index + 1);
      else if (e.code === 'Home') previewRecall(controller, 0);
      else if (e.code === 'End') previewRecall(controller, last);
      else if (!e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) resumeRecall(controller);
      else if (!e.repeat && (e.code === 'Escape' || e.code === 'Backspace')) cancelRecall(controller);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [controller, open]);

  if (!recall || recall.index < 0) return null;
  const frames = controller.tape.frames;
  const frame = frames[recall.index];
  if (!frame) return null;
  const back = Math.max(0, Math.round((recallPresentTick() - frame.tick) / TICK_RATE));
  const undone = undoneMarks(frames, recall.index);
  const trouble = undone.filter((m) => m.kind !== 'success');

  return (
    <div className={styles.recall} data-testid="recall" data-frame={recall.index} role="dialog" aria-modal="true" aria-label="Field recorder">
      <div key={recall.index} className={styles.recallTear} aria-hidden="true" />
      <div className={styles.recallStamp}>
        <span className={styles.recallDot} aria-hidden="true" />
        Field recorder
      </div>
      <div className={styles.recallReadout} aria-live="polite">
        <p key={recall.index} className={styles.recallBack}>
          −{back}
          <small> s</small>
        </p>
        <p className={styles.recallClock}>Mission time {formatClock(frame.tick)}</p>
        <p className={styles.recallUndo}>
          {trouble.length > 0 ? (
            <>
              Before{' '}
              {trouble.slice(0, 4).map((m) => (
                <span key={`${m.tick}-${m.text}`} className={styles[`recallMark_${m.kind}`]}>
                  {m.text}
                </span>
              ))}
            </>
          ) : (
            'Nothing has gone wrong since this frame'
          )}
        </p>
      </div>
      <div className={styles.recallDeck}>
        <div className={styles.recallStrip} role="listbox" aria-label="Frames, one every two seconds" aria-activedescendant={`recall-frame-${recall.index}`}>
          {frames.map((f, i) => (
            <button
              key={f.tick}
              id={`recall-frame-${i}`}
              type="button"
              role="option"
              aria-selected={i === recall.index}
              aria-label={`${formatClock(f.tick)}${f.marks.length > 0 ? `, then ${f.marks.map((m) => m.text).join(', ')}` : ''}`}
              className={styles.recallFrame}
              data-state={i === recall.index ? 'on' : i > recall.index ? 'erased' : undefined}
              data-mark={worst(f.marks)}
              onClick={() => previewRecall(controller, i)}
            >
              {(i === recall.index || i % 5 === 0) && <span>{formatClock(f.tick)}</span>}
            </button>
          ))}
          <button type="button" className={`${styles.recallFrame} ${styles.recallNow}`} onClick={() => cancelRecall(controller)} aria-label="Back to now">
            <span>Now</span>
          </button>
        </div>
        <div className={styles.recallActions}>
          <button type="button" className={styles.primaryButton} onClick={() => resumeRecall(controller)} data-testid="recall-resume">
            Resume from here <kbd>Enter</kbd>
          </button>
          <button type="button" className={styles.button} onClick={() => cancelRecall(controller)} data-testid="recall-cancel">
            Back to now <kbd>Esc</kbd>
          </button>
          <span className={styles.recallHint}>
            <kbd>←</kbd> <kbd>→</kbd> wind the tape · resuming erases what came after
          </span>
        </div>
      </div>
    </div>
  );
}
