import type { SVGProps } from 'react';

/** Small line icons for HUD states. Every state also has a text label; icons never stand alone. */
export type IconName = 'eye' | 'alert' | 'search' | 'cross' | 'lock' | 'exit' | 'mask' | 'wave' | 'pause' | 'clock' | 'check' | 'diamond' | 'x' | 'star' | 'body' | 'sound' | 'play' | 'rotate-left' | 'rotate-right' | 'target' | 'menu' | 'rewind';

const PATHS: Record<IconName, string> = {
  eye: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
  alert: 'M12 3l10 18H2L12 3zm0 6v6m0 3v.5',
  search: 'M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13zm4.8 11.3L21 21',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z',
  lock: 'M6 11h12v10H6V11zm2 0V8a4 4 0 118 0v3',
  exit: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  mask: 'M3 8c3-2 15-2 18 0 0 6-3 9-6 9-1.5 0-2-2-3-2s-1.5 2-3 2c-3 0-6-3-6-9zm5 3h2m4 0h2',
  wave: 'M2 10c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 16c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0',
  pause: 'M8 5v14M16 5v14',
  clock: 'M12 3a9 9 0 110 18 9 9 0 010-18zm0 4v5l3 3',
  check: 'M4 12l5 5L20 6',
  diamond: 'M12 3l8 9-8 9-8-9 8-9z',
  x: 'M5 5l14 14M19 5L5 19',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z',
  body: 'M3 17h18M7 13a2 2 0 100-4 2 2 0 000 4zm3 0h8',
  sound: 'M4 9v6h4l5 4V5L8 9H4zm12 0a4 4 0 010 6m2-9a8 8 0 010 12',
  play: 'M7 4l13 8-13 8V4z',
  'rotate-left': 'M4 4v6h6M4.6 15a8 8 0 101.9-8.3L4 10',
  'rotate-right': 'M20 4v6h-6M19.4 15a8 8 0 11-1.9-8.3L20 10',
  target: 'M12 3a9 9 0 110 18 9 9 0 010-18zm0 5a4 4 0 110 8 4 4 0 010-8zM12 1v4m0 14v4M1 12h4m14 0h4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  rewind: 'M11 6l-8 6 8 6V6zm10 0l-8 6 8 6V6z',
};

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}
