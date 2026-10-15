import type { Vec2 } from '../core/math';
import type { AlarmLevel, GuardRank, ItemId, SpecialistId, Temperament, Weather } from './types';

/**
 * Fully resolved mission, ready for the simulation: every position is concrete and every entity
 * references real level features. Produced from a validated mission spec plus a generated level.
 */
export interface MissionRuntime {
  id: string;
  title: string;
  templateId: string;
  env: { timeOfDay: number; weather: Weather };
  squadSpawns: { pos: Vec2; facing: number }[];
  requiredRoles: SpecialistId[];
  squadSize: { min: number; max: number };
  guards: GuardSpawn[];
  objects: ObjectSpawn[];
  objectives: ObjectiveDef[];
  extractionZoneId: string;
  holdingZoneId: string | null;
  director: DirectorEventDef[];
  /** Mission fails when the alarm reaches this level (null = never). Always stated in the briefing. */
  failAtAlarm: AlarmLevel | null;
  parSeconds: number;
  reinforcementSpawns: { sector: string; pos: Vec2; count: number }[];
}

export interface GuardSpawn {
  id: string;
  archetype: string;
  rank: GuardRank;
  temperament: Temperament;
  sector: string;
  postId?: string;
  routeId?: string;
  /** Index of the route point this guard starts at (staggers guards sharing a route). */
  routeStart?: number;
  pos?: Vec2;
  facing?: number;
  radio?: boolean;
  lantern?: boolean;
}

export type ObjectSpawn =
  | { type: 'door'; id: string; pos: Vec2; locked?: boolean; open?: boolean; width?: number }
  | { type: 'fence'; id: string; pos: Vec2; cells: number[] }
  | { type: 'item'; id: string; pos: Vec2; item: ItemId; amount: number }
  | { type: 'container'; id: string; pos: Vec2; capacity: number }
  | {
      type: 'alarm-bell' | 'radio' | 'searchlight' | 'objective-target';
      id: string;
      pos: Vec2;
      label: string;
      sector: string;
      heading?: number;
      sweepArc?: number;
      sweepPeriod?: number;
      range?: number;
    }
  | { type: 'prisoner'; id: string; pos: Vec2 };

interface ObjectiveBase {
  id: string;
  title: string;
  description: string;
  required: boolean;
  /** Hidden objectives are revealed by director events. */
  hidden?: boolean;
}

export type ObjectiveDef =
  | (ObjectiveBase & { kind: 'disable-target'; targetId: string })
  | (ObjectiveBase & { kind: 'acquire-item'; itemObjectId: string })
  | (ObjectiveBase & { kind: 'rescue'; prisonerId: string })
  | (ObjectiveBase & { kind: 'reach-zone'; zoneId: string });

export type DirectorTrigger =
  | { type: 'time'; seconds: number }
  | { type: 'objective'; objectiveId: string }
  | { type: 'alarm'; level: AlarmLevel }
  | { type: 'item-taken'; itemObjectId: string };

export type DirectorAction =
  | { type: 'reveal-objective'; objectiveId: string }
  | { type: 'message'; speaker: string; lineKey: string; text: string }
  | { type: 'reinforce'; sector: string; count: number }
  | { type: 'weather'; weather: Weather };

export interface DirectorEventDef {
  id: string;
  trigger: DirectorTrigger;
  actions: DirectorAction[];
}
