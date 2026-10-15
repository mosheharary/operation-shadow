import { SPECIALISTS, type SpecialistId } from '@operation-shadow/engine';
import { SPECIALIST_PROFILES } from '../specialists';
import type { MissionEntry } from './types';

/** Parses a comma-separated squad ("engineer,recon") into known specialist ids, in order. */
export function parseSquad(value: string | null | undefined): SpecialistId[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is SpecialistId => (SPECIALISTS as readonly string[]).includes(s));
}

/** Same rules the engine enforces at mission start, with player-facing names. Null when valid. */
export function checkSquad(entry: Pick<MissionEntry, 'squad'>, squad: SpecialistId[]): string | null {
  if (new Set(squad).size !== squad.length) return 'Each specialist can only be deployed once.';
  if (squad.length < entry.squad.min || squad.length > entry.squad.max) return `Choose ${entry.squad.min} to ${entry.squad.max} specialists for this operation.`;
  const missing = entry.squad.required.filter((role) => !squad.includes(role));
  if (missing.length > 0) return `This operation requires ${missing.map((r) => `the ${SPECIALIST_PROFILES[r].roleLabel}`).join(' and ')}.`;
  return null;
}
