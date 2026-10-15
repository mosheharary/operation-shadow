import type { Vec2 } from '../core/math';
import type { AbilityId, AbilityTarget, Gait, Stance } from './types';

/** Player orders. Validated when enqueued and applied at the next tick boundary. */
export type Command =
  | { type: 'move'; unitIds: string[]; target: Vec2; gait: Gait; queue?: boolean }
  | { type: 'stance'; unitIds: string[]; stance: Stance }
  | { type: 'stop'; unitIds: string[] }
  | { type: 'ability'; unitId: string; abilityId: AbilityId; target: AbilityTarget; queue?: boolean; gait?: Gait };

export type RejectReason =
  | 'unknown-unit'
  | 'unit-unavailable'
  | 'not-your-ability'
  | 'no-item'
  | 'cooldown'
  | 'invalid-target'
  | 'out-of-range'
  | 'no-line-of-sight'
  | 'unreachable'
  | 'wrong-stance'
  | 'busy'
  | 'condition';

export type CommandResult = { ok: true } | { ok: false; reason: RejectReason; message: string };

export const reject = (reason: RejectReason, message: string): CommandResult => ({ ok: false, reason, message });
export const OK: CommandResult = { ok: true };
