export {};

interface GameProbe {
  tick: number;
  status: 'running' | 'success' | 'failed';
  paused: boolean;
  alarm: number;
  selected: string[];
  conesVisible: number;
  operatives: { id: string; role: string; x: number; z: number; status: string; stance: string; busy: boolean }[];
}

declare global {
  interface Window {
    /** Renderer sample published by the in-game performance probe (see apps/web/.../perf-probe.tsx). */
    __OS_RENDER__?: { fps: number; drawCalls: number; triangles: number; frames: number };
    /** Authored model load status (apps/web/src/game/assets/status.ts). */
    __OS_ASSETS__?: () => { loaded: string[]; failed: Record<string, string> };
    /** Read-only game probe (apps/web/src/game/render/test-hooks.tsx). */
    __OS_GAME__?: {
      probe: () => GameProbe;
      screenOf: (x: number, z: number) => { x: number; y: number } | null;
      entityScreen: (id: string) => { x: number; y: number } | null;
    };
  }
}
