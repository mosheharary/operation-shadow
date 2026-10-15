import { create } from 'zustand';

/** Per-browser game settings. Account-level preferences sync from the server in a later milestone. */
export interface GameSettings {
  quality: 'high' | 'low';
  edgeScroll: boolean;
  reducedShake: boolean;
  subtitles: boolean;
  showNoise: boolean;
  showFps: boolean;
  masterVolume: number;
  musicVolume: number;
  voiceVolume: number;
  effectsVolume: number;
}

const DEFAULTS: GameSettings = {
  quality: 'high',
  edgeScroll: false,
  reducedShake: false,
  subtitles: true,
  showNoise: true,
  showFps: false,
  masterVolume: 0.8,
  musicVolume: 0.55,
  voiceVolume: 0.9,
  effectsVolume: 0.8,
};

const STORAGE_KEY = 'operation-shadow:settings';

function load(): GameSettings {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function save(settings: GameSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private windows); settings then last for the session only.
  }
}

interface SettingsStore extends GameSettings {
  hydrated: boolean;
  hydrate: () => void;
  update: (patch: Partial<GameSettings>) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ ...load(), hydrated: true });
  },
  update: (patch) => {
    set(patch);
    const { hydrated: _h, hydrate: _hy, update: _u, ...current } = get();
    save(current);
  },
}));
