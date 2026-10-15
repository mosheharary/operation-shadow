'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';

export interface RenderSample {
  fps: number;
  drawCalls: number;
  triangles: number;
  frames: number;
}

declare global {
  interface Window {
    /** Latest renderer sample; read by browser tests to prove frames are actually rendering. */
    __OS_RENDER__?: RenderSample;
  }
}

const SAMPLE_INTERVAL_MS = 500;

/**
 * Samples frame rate and renderer statistics. useFrame runs before each render, so
 * `gl.info.render` still holds the previous frame's counters.
 */
export function PerfProbe({ onSample }: { onSample: (sample: RenderSample) => void }) {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  const windowFrames = useRef(0);
  const windowStart = useRef<number | null>(null);

  useFrame(() => {
    // Post-processing renders several passes per frame; count them all and reset once per frame.
    gl.info.autoReset = false;
    const now = performance.now();
    windowStart.current ??= now;
    frames.current += 1;
    windowFrames.current += 1;
    const elapsed = now - windowStart.current;
    const calls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    gl.info.reset();
    if (elapsed < SAMPLE_INTERVAL_MS) return;

    const sample: RenderSample = {
      fps: Math.round((windowFrames.current * 1000) / elapsed),
      drawCalls: calls,
      triangles,
      frames: frames.current,
    };
    windowFrames.current = 0;
    windowStart.current = now;
    window.__OS_RENDER__ = sample;
    onSample(sample);
  });

  return null;
}
