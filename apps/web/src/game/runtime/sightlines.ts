import { type SimState, THRESHOLD } from '@operation-shadow/engine';

/**
 * Sightlines: who is watching whom, and how close each watcher is to calling it. The overlay draws
 * each one as a thread from the sentry's eyes that creeps along toward the operative as his
 * suspicion builds (touching them is "spotted"), and the HUD turns the strongest into a pulse at the
 * screen edge pointing at the watcher. Pure data from the simulation; contains no React or three.js.
 */

export type SightlineStage = 'watch' | 'suspect' | 'close' | 'seen';

export interface Sightline {
  guardId: string;
  targetId: string;
  /** Suspicion as a share of the "detected" threshold, 0..1. */
  level: number;
  stage: SightlineStage;
  /** False once the guard has lost sight and the suspicion is only decaying. */
  seeing: boolean;
}

/**
 * A guard re-checks his sight every 1–4 ticks depending on how close the squad is, so a target
 * he saw within this many ticks still counts as in view.
 */
export const SIGHT_GRACE_TICKS = 6;

export function stageFor(value: number): SightlineStage {
  if (value >= THRESHOLD.detected) return 'seen';
  if (value >= THRESHOLD.investigate) return 'close';
  if (value >= THRESHOLD.suspicious) return 'suspect';
  return 'watch';
}

/** Every guard–operative pair at or above the observe threshold, strongest first. */
export function sightlines(state: Pick<SimState, 'guards' | 'operatives' | 'tick'>): Sightline[] {
  const out: Sightline[] = [];
  const active = new Set(state.operatives.filter((op) => op.status === 'active').map((op) => op.id));
  for (const g of state.guards) {
    if (g.status !== 'active') continue;
    for (const entry of g.suspicion) {
      if (entry.value < THRESHOLD.observe || !active.has(entry.targetId)) continue;
      out.push({
        guardId: g.id,
        targetId: entry.targetId,
        level: Math.min(1, entry.value / THRESHOLD.detected),
        stage: stageFor(entry.value),
        seeing: state.tick - entry.lastSeenTick <= SIGHT_GRACE_TICKS,
      });
    }
  }
  return out.sort((a, b) => b.level - a.level);
}

/** How strongly the squad is being watched right now, 0..1: the closest live call, or nothing. */
export function dangerLevel(lines: readonly Sightline[]): number {
  let max = 0;
  for (const line of lines) if (line.seeing && line.level > max) max = line.level;
  return max;
}

/** The strongest watch on each operative, for the portrait meters. */
export function watchByOperative(lines: readonly Sightline[]): Map<string, Sightline> {
  const out = new Map<string, Sightline>();
  for (const line of lines) {
    const current = out.get(line.targetId);
    if (!current || line.level > current.level) out.set(line.targetId, line);
  }
  return out;
}

/**
 * Seconds between heartbeats at a given danger level: none while calm, a slow thud once a
 * sentry grows suspicious, racing as he is about to call it.
 */
export function heartbeatInterval(danger: number): number | null {
  if (danger < THRESHOLD.suspicious / THRESHOLD.detected) return null;
  return 1.1 - 0.6 * Math.min(1, (danger - 0.45) / 0.55);
}

/** A watcher drawn at the screen edge: where to put the marker for a point off screen. */
export interface EdgeMarker {
  /** Screen position in pixels, clamped inside the margin. */
  x: number;
  y: number;
  /** Direction from the screen centre toward the watcher, radians (screen space, y down). */
  angle: number;
}

/**
 * Places a marker for a projected point (normalised device coordinates, behind = point is behind
 * the camera) on the edge of a width × height screen, or null if the point is comfortably on screen.
 * The insets keep it clear of the HUD bars along the top and bottom.
 */
export interface EdgeInsets {
  side: number;
  top: number;
  bottom: number;
}

export function edgeMarker(ndcX: number, ndcY: number, behind: boolean, width: number, height: number, inset: EdgeInsets): EdgeMarker | null {
  let dx = ndcX;
  let dy = -ndcY;
  // Behind the camera the projection mirrors through the centre.
  if (behind) {
    dx = -dx;
    dy = -dy;
  }
  const inside = !behind && Math.abs(ndcX) <= 0.92 && Math.abs(ndcY) <= 0.9;
  if (inside) return null;
  // Walk from the centre of the inset rectangle toward the point until it meets an edge.
  const cx = width / 2;
  const cy = (inset.top + (height - inset.bottom)) / 2;
  const halfW = width / 2 - inset.side;
  const halfH = (height - inset.top - inset.bottom) / 2;
  if (dx === 0 && dy === 0) dy = 1;
  const px = dx * (width / 2);
  const py = dy * (height / 2);
  const k = Math.min(px !== 0 ? halfW / Math.abs(px) : Infinity, py !== 0 ? halfH / Math.abs(py) : Infinity);
  return {
    x: cx + px * k,
    y: cy + py * k,
    angle: Math.atan2(py, px),
  };
}

/** An off-screen watcher as the HUD draws it. */
export interface RimMarker extends EdgeMarker {
  guardId: string;
  level: number;
  stage: SightlineStage;
}

/**
 * What the danger rim shows this frame. The overlay (which owns the camera) writes it every frame and
 * the HUD reads it on its own animation frame, so neither re-renders React for it.
 */
export const rimFrame: { danger: number; markers: RimMarker[] } = { danger: 0, markers: [] };

export function clearRim(): void {
  rimFrame.danger = 0;
  rimFrame.markers = [];
}
