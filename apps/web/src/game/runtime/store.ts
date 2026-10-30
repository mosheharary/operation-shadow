import type { AbilityId, Vec2 } from '@operation-shadow/engine';
import { create } from 'zustand';

export type HoverTarget = { kind: 'operative' | 'guard' | 'object'; id: string } | null;

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warning' | 'danger';
  at: number;
}

export interface Subtitle {
  id: number;
  speaker: string;
  text: string;
  until: number;
  priority: number;
}

export interface NoiseRing {
  id: number;
  pos: Vec2;
  radius: number;
  born: number;
  kind: 'footstep' | 'loud' | 'lure';
}

export interface ContextHint {
  label: string;
  ok: boolean;
  message?: string;
}

export interface OrderMarker {
  id: number;
  pos: Vec2;
  kind: 'move' | 'run' | 'action' | 'blocked';
  at: number;
}

export interface DragBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A cinematic in progress: which reel and which of its shots (for letterbox, captions and skipping). */
export interface CinematicState {
  kind: 'intro' | 'outro';
  shot: number;
  /** Length of the reel up to its resting shot (or its end), for the progress line. */
  seconds: number;
}

export interface GameUiState {
  selected: string[];
  hovered: HoverTarget;
  groundPoint: Vec2 | null;
  targeting: AbilityId | null;
  pinnedCones: string[];
  showAllCones: boolean;
  menu: 'none' | 'pause' | 'help' | 'briefing' | 'saves' | 'settings' | 'exit';
  toasts: Toast[];
  subtitles: Subtitle[];
  noiseRings: NoiseRing[];
  cameraFocus: { pos: Vec2; at: number } | null;
  tracking: boolean;
  contextHint: ContextHint | null;
  orderMarker: OrderMarker | null;
  dragBox: DragBox | null;
  /** Ground ring the tutorial points at. */
  tutorialMarker: Vec2 | null;
  /** The mission's opening or closing reel; the HUD steps aside while one plays. */
  cinematic: CinematicState | null;
  select: (ids: string[], additive?: boolean) => void;
  setHovered: (target: HoverTarget) => void;
  setGroundPoint: (point: Vec2 | null) => void;
  setTargeting: (ability: AbilityId | null) => void;
  toggleCone: (guardId: string) => void;
  setShowAllCones: (on: boolean) => void;
  setMenu: (menu: GameUiState['menu']) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  subtitle: (speaker: string, text: string, seconds: number, priority: number) => void;
  addNoiseRing: (ring: Omit<NoiseRing, 'id' | 'born'>) => void;
  prune: (now: number) => void;
  focusCamera: (pos: Vec2) => void;
  setTracking: (on: boolean) => void;
  setContextHint: (hint: ContextHint | null) => void;
  markOrder: (pos: Vec2, kind: OrderMarker['kind']) => void;
  setDragBox: (box: DragBox | null) => void;
  setTutorialMarker: (pos: Vec2 | null) => void;
  setCinematic: (cinematic: CinematicState | null) => void;
  reset: () => void;
}

let nextId = 1;

const initial = {
  selected: [] as string[],
  hovered: null as HoverTarget,
  groundPoint: null as Vec2 | null,
  targeting: null as AbilityId | null,
  pinnedCones: [] as string[],
  showAllCones: false,
  menu: 'none' as const,
  toasts: [] as Toast[],
  subtitles: [] as Subtitle[],
  noiseRings: [] as NoiseRing[],
  cameraFocus: null as GameUiState['cameraFocus'],
  tracking: false,
  contextHint: null as ContextHint | null,
  orderMarker: null as OrderMarker | null,
  dragBox: null as DragBox | null,
  tutorialMarker: null as Vec2 | null,
  cinematic: null as CinematicState | null,
};

/** UI-only state for one game session. Gameplay state lives in the engine, never here. */
export const useGameUi = create<GameUiState>((set) => ({
  ...initial,
  select: (ids, additive = false) =>
    set((s) => {
      if (!additive) return { selected: ids, targeting: null };
      const merged = new Set(s.selected);
      for (const id of ids) {
        if (merged.has(id)) merged.delete(id);
        else merged.add(id);
      }
      return { selected: [...merged], targeting: null };
    }),
  setHovered: (hovered) => set({ hovered }),
  setGroundPoint: (groundPoint) => set({ groundPoint }),
  setTargeting: (targeting) => set({ targeting }),
  toggleCone: (guardId) =>
    set((s) => ({ pinnedCones: s.pinnedCones.includes(guardId) ? s.pinnedCones.filter((id) => id !== guardId) : [...s.pinnedCones, guardId] })),
  setShowAllCones: (showAllCones) => set({ showAllCones }),
  setMenu: (menu) => set({ menu }),
  toast: (text, kind = 'warning') =>
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.text !== text).slice(-3), { id: nextId++, text, kind, at: performance.now() }] })),
  subtitle: (speaker, text, seconds, priority) =>
    set((s) => {
      const now = performance.now();
      const live = s.subtitles.filter((x) => x.until > now);
      // Higher-priority lines (alarms, HQ) replace chatter; equal priority queues behind.
      const kept = live.filter((x) => x.priority >= priority).slice(-1);
      return { subtitles: [...kept, { id: nextId++, speaker, text, until: now + seconds * 1000, priority }] };
    }),
  addNoiseRing: (ring) => set((s) => ({ noiseRings: [...s.noiseRings.slice(-24), { ...ring, id: nextId++, born: performance.now() }] })),
  prune: (now) =>
    set((s) => {
      const toasts = s.toasts.filter((t) => now - t.at < 2600);
      const subtitles = s.subtitles.filter((t) => t.until > now);
      const noiseRings = s.noiseRings.filter((r) => now - r.born < 900);
      if (toasts.length === s.toasts.length && subtitles.length === s.subtitles.length && noiseRings.length === s.noiseRings.length) return s;
      return { toasts, subtitles, noiseRings };
    }),
  focusCamera: (pos) => set({ cameraFocus: { pos, at: performance.now() } }),
  setTracking: (tracking) => set({ tracking }),
  setContextHint: (hint) =>
    set((s) => {
      const a = s.contextHint;
      if (a === hint || (a && hint && a.label === hint.label && a.ok === hint.ok && a.message === hint.message)) return s;
      return { contextHint: hint };
    }),
  markOrder: (pos, kind) => set({ orderMarker: { id: nextId++, pos, kind, at: performance.now() } }),
  setDragBox: (dragBox) => set({ dragBox }),
  setTutorialMarker: (tutorialMarker) => set({ tutorialMarker }),
  setCinematic: (cinematic) => set({ cinematic }),
  reset: () => set({ ...initial }),
}));
