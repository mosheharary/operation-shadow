import type { AudioEngine } from './audio-engine';

let current: AudioEngine | null = null;

/** The running mission's audio engine, for UI feedback sounds from input handlers. */
export function activeAudio(): AudioEngine | null {
  return current;
}

export function setActiveAudio(engine: AudioEngine | null): void {
  current = engine;
}
