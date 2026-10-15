import type { Vec2 } from '../core/math';
import type {
  AbilityId,
  AlarmLevel,
  GuardStateName,
  GuardStatus,
  LogEntry,
  NoiseKind,
  ObjectiveStatus,
  OperativeStatus,
  OutcomeCode,
} from './types';

/** Semantic voice/subtitle line keys; the content package maps them to text and audio. */
export type BarkLine =
  | 'ack-move'
  | 'ack-action'
  | 'warn-patrol'
  | 'success'
  | 'downed'
  | 'guard-suspicious'
  | 'guard-investigate'
  | 'guard-found-body'
  | 'guard-halt'
  | 'guard-alarm'
  | 'guard-all-clear'
  | 'guard-chatter';

/** Transient per-tick events for audio, UI and telemetry. Never part of the saved state. */
export type GameEvent =
  | { type: 'footstep'; unitId: string; pos: Vec2; surface: number; db: number }
  | { type: 'noise'; pos: Vec2; kind: NoiseKind; db: number; sourceId: string | null }
  | { type: 'bark'; speaker: string; line: BarkLine; priority: number }
  | { type: 'guard-state'; guardId: string; from: GuardStateName; to: GuardStateName }
  | { type: 'detected'; guardId: string; targetId: string }
  | { type: 'alarm'; level: AlarmLevel; previous: AlarmLevel; reason: string }
  | { type: 'objective'; id: string; status: ObjectiveStatus }
  | { type: 'ability'; unitId: string; abilityId: AbilityId; phase: 'start' | 'complete' | 'interrupted'; targetId?: string }
  | { type: 'shot'; shooterId: string; targetId: string; hit: boolean; weapon: string; from: Vec2; to: Vec2 }
  | { type: 'damage'; targetId: string; amount: number }
  | { type: 'operative-status'; unitId: string; status: OperativeStatus }
  | { type: 'guard-status'; guardId: string; status: GuardStatus }
  | { type: 'door'; objectId: string; open: boolean }
  | { type: 'explosion'; pos: Vec2 }
  | { type: 'bell'; objectId: string; pos: Vec2 }
  | { type: 'mission'; status: 'success' | 'failed'; code: OutcomeCode }
  | { type: 'rejected'; unitId: string; reason: string }
  | { type: 'message'; speaker: string; lineKey: string; text: string }
  | { type: 'log'; entry: LogEntry };
