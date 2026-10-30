'use client';

import { useEffect, useRef, useState } from 'react';
import { type Beat, BEAT_STYLES, beatFrame } from '../runtime/beats';
import type { GameController } from '../runtime/controller';
import { useController } from '../runtime/game-context';
import { useSettings } from '../runtime/settings';
import styles from './hud.module.css';

/**
 * The beat on screen, checked on every animation frame (the clock that starts one runs outside
 * React); re-renders only when a beat begins or ends. `onFrame` runs on every frame while one shows.
 */
function useBeat(controller: GameController, enabled: boolean, onFrame?: () => void): Beat | null {
  const [beat, setBeat] = useState<Beat | null>(null);
  const frame = useRef(onFrame);
  useEffect(() => {
    frame.current = onFrame;
  });

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let shown: number | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const current = controller.beats.showing(performance.now());
      const id = current?.id ?? null;
      if (id !== shown) {
        shown = id;
        setBeat(current);
      }
      if (current) frame.current?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [controller, enabled]);

  return enabled ? beat : null;
}

/** While a turning point holds the clock back, colour drains from the world (under the HUD panels). */
export function BeatVeil() {
  const controller = useController();
  const enabled = useSettings((s) => s.showBeats);
  const beat = useBeat(controller, enabled);
  if (!beat) return null;
  const style = BEAT_STYLES[beat.kind];
  const breath = { ['--breath' as string]: `${style.hold + style.recover + 0.1}s` };
  // Two layers: a blend layer draining the colour, and a rim of the moment's ink over it.
  return (
    <>
      <div key={`grey-${beat.id}`} className={styles.beatVeil} style={breath} />
      <div key={`ink-${beat.id}`} className={styles.beatTint} data-tone={beat.tone} style={breath} />
    </>
  );
}

/**
 * The HUD's half of a turning point (see runtime/beats.ts): an ink stamp slams down on the spot
 * where it happened, naming the moment. A spot out of view keeps the stamp on the screen edge with a
 * needle toward it, so "Now extract" also says which way. Follows the spot on its own animation
 * frame from the position the scene projects.
 */
export function BeatStamp() {
  const controller = useController();
  const enabled = useSettings((s) => s.showBeats);
  const anchor = useRef<HTMLDivElement>(null);
  const beat = useBeat(controller, enabled, () => {
    const el = anchor.current;
    if (!el) return;
    el.style.transform = `translate(${Math.round(beatFrame.x)}px, ${Math.round(beatFrame.y)}px)`;
    el.style.setProperty('--angle', `${beatFrame.angle}rad`);
    const edge = beatFrame.edge ? '1' : '0';
    if (el.dataset.edge !== edge) el.dataset.edge = edge;
  });

  if (!beat) return null;
  return (
    <div
      key={beat.id}
      ref={anchor}
      className={styles.beatAnchor}
      data-tone={beat.tone}
      data-edge={beatFrame.edge ? '1' : '0'}
      style={{
        transform: `translate(${Math.round(beatFrame.x)}px, ${Math.round(beatFrame.y)}px)`,
        ['--angle' as string]: `${beatFrame.angle}rad`,
        ['--show' as string]: `${BEAT_STYLES[beat.kind].show}s`,
      }}
    >
      <div className={styles.beatStamp} role="status" data-testid="beat-stamp" data-kind={beat.kind}>
        <strong>
          {/* Out of view: a needle on the stamp points the way. */}
          <span className={styles.beatArrow} aria-hidden="true" />
          {beat.title}
        </strong>
        <span>{beat.detail}</span>
      </div>
    </div>
  );
}
