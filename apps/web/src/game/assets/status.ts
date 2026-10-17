import { create } from 'zustand';

/** Which authored models have loaded or failed (read by the asset gallery and browser tests). */
interface AssetStatus {
  loaded: string[];
  failed: Record<string, string>;
  markLoaded: (id: string) => void;
  markFailed: (id: string, reason: string) => void;
}

export const useAssetStatus = create<AssetStatus>((set) => ({
  loaded: [],
  failed: {},
  markLoaded: (id) => set((s) => (s.loaded.includes(id) ? s : { loaded: [...s.loaded, id] })),
  markFailed: (id, reason) => set((s) => ({ failed: { ...s.failed, [id]: reason } })),
}));

declare global {
  interface Window {
    /** Read-only asset load status for browser tests. */
    __OS_ASSETS__?: () => { loaded: string[]; failed: Record<string, string> };
  }
}

if (typeof window !== 'undefined') {
  window.__OS_ASSETS__ = () => {
    const { loaded, failed } = useAssetStatus.getState();
    return { loaded: [...loaded], failed: { ...failed } };
  };
}
