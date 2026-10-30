import { scoreMission, type SimState, TICK_RATE } from '@operation-shadow/engine';
import type { ApiError, SavePayload, SaveSlotId, SaveSummary } from '@operation-shadow/schemas';
import { type CameraView, getCameraView, setCameraView } from '../camera/camera-rig';
import type { GameController } from './controller';
import { useGameUi } from './store';

/** Autosave cadence while no guard is alerted (plan §9.3), in simulation seconds. */
const AUTOSAVE_SECONDS = 300;

// ── Pending saves (kept on this device when the network fails) ─────────────────────────────────

const DB_NAME = 'operation-shadow';
const STORE = 'pending-saves';

function openStore(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openStore();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).finally(() => db.close()) as Promise<T | null>;
}

const keepPending = (slot: SaveSlotId, gzip: ArrayBuffer) => withStore('readwrite', (s) => s.put(gzip, slot));
const dropPending = (slot: SaveSlotId) => withStore('readwrite', (s) => s.delete(slot));

// ── API ────────────────────────────────────────────────────────────────────────────────────────

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function upload(slot: SaveSlotId, body: ArrayBuffer): Promise<{ ok: true; save: SaveSummary } | { ok: false; network: boolean; message: string }> {
  try {
    const res = await fetch(`/api/v1/saves/${slot}`, { method: 'PUT', headers: { 'content-type': 'application/gzip' }, body });
    const json = (await res.json().catch(() => null)) as { save: SaveSummary } | ApiError | null;
    if (res.ok && json && 'save' in json) return { ok: true, save: json.save };
    return { ok: false, network: res.status >= 500, message: json && 'error' in json ? json.error.message : 'The save was refused' };
  } catch {
    return { ok: false, network: true, message: 'No connection' };
  }
}

/** Uploads saves that were kept on this device while offline. */
export async function flushPendingSaves(): Promise<void> {
  const slots = ((await withStore('readonly', (s) => s.getAllKeys())) ?? []) as SaveSlotId[];
  for (const slot of slots) {
    const body = (await withStore('readonly', (s) => s.get(slot))) as ArrayBuffer | null;
    if (!body) continue;
    const result = await upload(slot, body);
    if (result.ok || !result.network) await dropPending(slot);
  }
}

export async function fetchSave(slot: SaveSlotId): Promise<{ payload: SavePayload; recovered: boolean } | { error: string }> {
  try {
    const res = await fetch(`/api/v1/saves/${slot}`);
    const json = (await res.json().catch(() => null)) as { payload: SavePayload; recovered: boolean } | ApiError | null;
    if (res.ok && json && 'payload' in json) return json;
    if (res.status === 404) return { error: 'There is no save in that slot' };
    return { error: json && 'error' in json ? json.error.message : 'The save could not be loaded' };
  } catch {
    return { error: 'No connection' };
  }
}

export async function listSaves(): Promise<SaveSummary[]> {
  try {
    const res = await fetch('/api/v1/saves');
    if (!res.ok) return [];
    return ((await res.json()) as { saves: SaveSummary[] }).saves;
  } catch {
    return [];
  }
}

/** Deletes a slot on the server, and any copy of it still waiting on this device. */
export async function deleteSave(slot: SaveSlotId): Promise<{ ok: true } | { error: string }> {
  await dropPending(slot);
  try {
    const res = await fetch(`/api/v1/saves/${slot}`, { method: 'DELETE' });
    if (res.ok || res.status === 404) return { ok: true };
    const json = (await res.json().catch(() => null)) as ApiError | null;
    return { error: json && 'error' in json ? json.error.message : 'The save could not be deleted' };
  } catch {
    return { error: 'No connection' };
  }
}

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ── Session wiring ─────────────────────────────────────────────────────────────────────────────

/**
 * Saving, loading and run reporting for one play session: quicksave and quickload, autosaves when
 * an objective completes and every five minutes while no guard is alerted, and the run record.
 */
export class SessionPersistence {
  private runId: string | null = null;
  private reported = false;
  private lastAutosaveTick = 0;
  private saving = false;

  constructor(
    private readonly controller: GameController,
    /** Opens another mission (a save from a different mission or squad starts a fresh session). */
    private readonly navigate: (url: string) => void,
  ) {}

  start(): () => void {
    void flushPendingSaves();
    this.openRun();
    this.lastAutosaveTick = this.controller.world.state.tick;
    const stop = this.controller.onEvents((events) => {
      const s = this.controller.world.state;
      for (const e of events) {
        if (e.type === 'objective' && e.status === 'completed' && s.status === 'running') void this.save('auto', true);
        if (e.type === 'mission') void this.report();
      }
      const calm = s.alarm.level < 2 && s.guards.every((g) => g.status !== 'active' || (g.state !== 'alerted' && g.state !== 'combat' && g.state !== 'search'));
      if (s.status === 'running' && calm && s.tick - this.lastAutosaveTick >= AUTOSAVE_SECONDS * TICK_RATE) void this.save('auto', true);
    });
    const leave = () => void this.report('abandoned');
    window.addEventListener('pagehide', leave);
    return () => {
      stop();
      window.removeEventListener('pagehide', leave);
      void this.report('abandoned');
    };
  }

  /** Starts the run record for this attempt; its outcome is reported once the mission ends. */
  private openRun(): void {
    const { setup } = this.controller;
    post('/api/v1/mission-runs', { missionKey: setup.missionKey, squad: setup.squad, difficulty: setup.difficulty, seed: setup.seed })
      .then(async (res) => (res.ok ? ((await res.json()) as { run: { id: string } }).run.id : null))
      .then((id) => {
        this.runId = id;
        if (this.controller.world.state.status !== 'running') void this.report();
      })
      .catch(() => undefined);
  }

  /**
   * A failed mission wound back on the field recorder plays on: its failure stays on record, and
   * what happens next is reported as a new run.
   */
  reopen(): void {
    if (!this.reported) return;
    this.reported = false;
    this.runId = null;
    this.openRun();
  }

  private payload(): SavePayload {
    const { controller } = this;
    const view: CameraView | null = getCameraView();
    return {
      version: 1,
      missionKey: controller.setup.missionKey,
      missionTitle: controller.entry.title.slice(0, 60),
      setup: { seed: controller.setup.seed, squad: controller.setup.squad, difficulty: controller.setup.difficulty },
      state: controller.world.snapshot() as unknown as SavePayload['state'],
      camera: view,
      selection: useGameUi.getState().selected.slice(0, 6),
      savedAt: new Date().toISOString(),
    };
  }

  /** Saves to a slot; when the network fails the save is kept on this device and retried later. */
  async save(slot: SaveSlotId, quiet = false): Promise<boolean> {
    const ui = useGameUi.getState();
    if (this.controller.world.state.status !== 'running') {
      if (!quiet) ui.toast('The mission is over: nothing to save', 'warning');
      return false;
    }
    if (this.saving) return false;
    this.saving = true;
    if (slot === 'auto') this.lastAutosaveTick = this.controller.world.state.tick;
    try {
      const body = await gzip(JSON.stringify(this.payload()));
      const result = await upload(slot, body);
      if (result.ok) {
        await dropPending(slot);
        ui.toast(slot === 'auto' ? 'Autosaved' : slot === 'quick' ? 'Quicksaved' : 'Game saved', 'info');
        return true;
      }
      if (result.network) {
        await keepPending(slot, body);
        ui.toast('Saved on this device; it will upload when the connection is back', 'warning');
        return true;
      }
      ui.toast(`Save failed: ${result.message}`, 'danger');
      return false;
    } finally {
      this.saving = false;
    }
  }

  /** Loads a slot into this session if it belongs to the same mission and squad. */
  async load(slot: SaveSlotId): Promise<boolean> {
    const ui = useGameUi.getState();
    const result = await fetchSave(slot);
    if ('error' in result) {
      ui.toast(result.error, 'warning');
      return false;
    }
    const { payload } = result;
    const { setup } = this.controller;
    const same = payload.missionKey === setup.missionKey && payload.setup.seed === setup.seed && payload.setup.difficulty === setup.difficulty && payload.setup.squad.join() === setup.squad.join();
    if (!same) {
      this.navigate(`/play/${payload.missionKey}?save=${slot}`);
      return true;
    }
    if (!applySave(this.controller, payload)) {
      ui.toast('That save could not be restored', 'danger');
      return false;
    }
    ui.toast(result.recovered ? 'Loaded an earlier copy: the newest save was damaged' : 'Game loaded', result.recovered ? 'warning' : 'info');
    return true;
  }

  /** Reports the outcome once (success, failure, or abandoned when leaving mid-mission). */
  async report(abandon?: 'abandoned'): Promise<void> {
    if (this.reported || !this.runId) return;
    const s = this.controller.world.state;
    if (s.status === 'running' && !abandon) return;
    this.reported = true;
    const score = s.status === 'running' ? null : scoreMission(s, this.controller.mission);
    const body = {
      outcome: s.status === 'success' ? 'success' : s.status === 'running' ? 'abandoned' : 'failure',
      score: score?.success ? score.score : null,
      rank: score?.success && score.rank !== '-' ? score.rank : null,
      medals: score?.medals ?? [],
      durationSeconds: Math.round(s.tick / TICK_RATE),
      stats: Object.fromEntries(Object.entries(s.stats).filter(([, v]) => typeof v === 'number')) as Record<string, number>,
    };
    const url = `/api/v1/mission-runs/${this.runId}/complete`;
    if (abandon && document.visibilityState === 'hidden' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: 'application/json' }));
      return;
    }
    await post(url, body).catch(() => undefined);
  }
}

/** Restores a saved state, camera and selection; false when the engine refuses the state. */
export function applySave(controller: GameController, payload: Pick<SavePayload, 'state' | 'camera' | 'selection'>): boolean {
  try {
    controller.load(payload.state as unknown as SimState);
  } catch {
    return false;
  }
  restoreView(controller, payload);
  return true;
}

/** Camera and selection from a save (the state itself is already loaded). */
export function restoreView(controller: GameController, payload: Pick<SavePayload, 'camera' | 'selection'>): void {
  setCameraView(payload.camera);
  const alive = payload.selection.filter((id) => controller.world.operative(id)?.status === 'active');
  const first = controller.world.state.operatives.find((op) => op.status === 'active');
  useGameUi.getState().select(alive.length > 0 ? alive : first ? [first.id] : []);
}

let active: SessionPersistence | null = null;
export const setActivePersistence = (p: SessionPersistence | null) => {
  active = p;
};
export const getActivePersistence = () => active;
