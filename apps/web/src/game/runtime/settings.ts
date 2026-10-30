import { create } from 'zustand';
import { type Bindings, setBindings } from '../input/bindings';

/**
 * Game settings: kept in this browser and synced to the account (newest copy wins), except the
 * graphics preset, which belongs to the device's GPU.
 */
export interface GameSettings {
  /** Preset that sets the three graphics options below ('custom' once one is changed by hand). */
  quality: 'high' | 'low' | 'custom';
  shadows: boolean;
  postEffects: boolean;
  /** Device pixel ratio cap: 0.75, 1, 1.25 or 1.5. */
  resolutionScale: number;
  /** Authored glTF models (props, vegetation, characters); procedural models otherwise. */
  models: boolean;
  /** 'rich' adds the sky light, grass, sharper ground detail and water reflections. */
  environment: 'basic' | 'rich';
  /** Interface size, 0.75 to 1.5. */
  uiScale: number;
  subtitleSize: 'normal' | 'large';
  /** Colour-blind-safe cone and alert colours (cones are also striped when alerted). */
  palette: 'standard' | 'colorblind';
  /** Camera rotate and tilt speed with the middle mouse button. */
  mouseSensitivity: number;
  /** Remapped keys (only the changed actions). */
  keyBindings: Partial<Bindings>;
  edgeScroll: boolean;
  reducedShake: boolean;
  subtitles: boolean;
  showNoise: boolean;
  /** Threads from each watching sentry to the operative he is sizing up, and the danger pulse at the screen edge. */
  showSightlines: boolean;
  showFps: boolean;
  masterVolume: number;
  musicVolume: number;
  voiceVolume: number;
  effectsVolume: number;
  /** When these settings last changed (ms since epoch); decides which copy wins when syncing. */
  updatedAt: number;
}

const DEFAULTS: GameSettings = {
  quality: 'high',
  shadows: true,
  postEffects: true,
  resolutionScale: 1.5,
  models: true,
  environment: 'rich',
  uiScale: 1,
  subtitleSize: 'normal',
  palette: 'standard',
  mouseSensitivity: 1,
  keyBindings: {},
  edgeScroll: false,
  reducedShake: false,
  subtitles: true,
  showNoise: true,
  showSightlines: true,
  showFps: false,
  masterVolume: 0.8,
  musicVolume: 0.55,
  voiceVolume: 0.9,
  effectsVolume: 0.8,
  updatedAt: 0,
};

/** Settings that stay on this device. */
const DEVICE_ONLY = new Set<keyof GameSettings>(['quality', 'shadows', 'postEffects', 'resolutionScale', 'models', 'environment', 'showFps']);

/** What each graphics preset sets. */
export const PRESETS: Record<'high' | 'low', Pick<GameSettings, 'shadows' | 'postEffects' | 'resolutionScale' | 'models' | 'environment'>> = {
  high: { shadows: true, postEffects: true, resolutionScale: 1.5, models: true, environment: 'rich' },
  low: { shadows: false, postEffects: false, resolutionScale: 1, models: false, environment: 'basic' },
};

const STORAGE_KEY = 'operation-shadow:settings';

function load(): GameSettings {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    // Older copies only stored the preset: derive its options.
    const preset = parsed.quality === 'low' || parsed.quality === 'high' ? PRESETS[parsed.quality] : {};
    return { ...DEFAULTS, ...preset, ...parsed };
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

const current = (s: SettingsStore): GameSettings => {
  const { hydrated: _h, hydrate: _hy, update: _u, ...settings } = s;
  return settings;
};

const shared = (settings: GameSettings) => Object.fromEntries(Object.entries(settings).filter(([k]) => !DEVICE_ONLY.has(k as keyof GameSettings)));

let pushTimer: number | undefined;
function pushToAccount(settings: GameSettings): void {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    void fetch('/api/v1/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, settings: shared(settings) }),
    }).catch(() => undefined);
  }, 1500);
}

/** Takes the account's copy when it is newer than this browser's. */
async function pullFromAccount(set: (s: Partial<GameSettings>) => void, get: () => SettingsStore): Promise<void> {
  try {
    const res = await fetch('/api/v1/preferences');
    if (!res.ok) return;
    const { preferences } = (await res.json()) as { preferences: { settings: Partial<GameSettings> } };
    const remote = preferences.settings;
    if (typeof remote.updatedAt !== 'number' || remote.updatedAt <= get().updatedAt) return;
    const patch: Partial<GameSettings> = {};
    for (const key of Object.keys(DEFAULTS) as (keyof GameSettings)[]) {
      if (DEVICE_ONLY.has(key) || remote[key] === undefined || typeof remote[key] !== typeof DEFAULTS[key]) continue;
      (patch as Record<string, unknown>)[key] = remote[key];
    }
    set(patch);
    save(current(get()));
  } catch {
    // Offline: this browser's copy stays in use.
  }
}

/** Settings that live outside React: key bindings and the interface scale. */
function applyGlobal(settings: GameSettings): void {
  setBindings(settings.keyBindings);
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ ...load(), hydrated: true });
    applyGlobal(current(get()));
    void pullFromAccount(set, get).then(() => applyGlobal(current(get())));
  },
  update: (patch) => {
    const synced = Object.keys(patch).some((k) => !DEVICE_ONLY.has(k as keyof GameSettings));
    set(synced ? { ...patch, updatedAt: Date.now() } : patch);
    save(current(get()));
    applyGlobal(current(get()));
    if (synced) pushToAccount(current(get()));
  },
}));
