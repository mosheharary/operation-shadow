'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './hud.module.css';

const DELAY_MS = 350;
const GAP = 8;
const MARGIN = 8;

interface Tip {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

/**
 * Hover and keyboard-focus tooltips for every HUD element with a `data-tip` attribute. One
 * fixed-position bubble for the whole HUD, so menus and panels never clip it; it sits above the
 * element (below with `data-tip-pos="below"`, or when there is no room above) and stays on screen.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      const rect = el.getBoundingClientRect();
      const below = el.dataset.tipPos === 'below' || rect.top < 60;
      setShift(0);
      setTip({ text, x: rect.left + rect.width / 2, y: below ? rect.bottom + GAP : rect.top - GAP, below });
    };
    const enter = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;
      if (el === current) return;
      current = el;
      window.clearTimeout(timer);
      if (!el) {
        setTip(null);
        return;
      }
      // Keyboard focus shows at once; hovering waits a moment so sweeping the mouse stays quiet.
      if (e.type === 'focusin') show(el);
      else timer = window.setTimeout(() => show(el), DELAY_MS);
    };
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    document.addEventListener('pointerover', enter);
    document.addEventListener('focusin', enter);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('keydown', hide);
    window.addEventListener('blur', hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', enter);
      document.removeEventListener('focusin', enter);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('keydown', hide);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Keep the bubble inside the window once its width is known.
  useEffect(() => {
    if (!tip || !bubble.current) return;
    const rect = bubble.current.getBoundingClientRect();
    const overLeft = MARGIN - rect.left;
    const overRight = rect.right - (window.innerWidth - MARGIN);
    setShift(overLeft > 0 ? overLeft : overRight > 0 ? -overRight : 0);
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={bubble}
      role="tooltip"
      className={styles.tooltip}
      data-testid="tooltip"
      style={{ left: tip.x + shift, top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}
    >
      {tip.text}
    </div>
  );
}
