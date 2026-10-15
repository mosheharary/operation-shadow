export {};

declare global {
  interface Window {
    /** Renderer sample published by the in-game performance probe (see apps/web/.../perf-probe.tsx). */
    __OS_RENDER__?: { fps: number; drawCalls: number; triangles: number; frames: number };
  }
}
