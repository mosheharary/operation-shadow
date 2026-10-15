import type { GuardRank, SpecialistId, Temperament, Weather, AlarmLevel } from '../sim/types';
import type { LevelData } from '../level/types';
import type { Vec2 } from '../core/math';

export const MISSION_SPEC_VERSION = 1;

export type GuardDensity = 'light' | 'standard' | 'heavy';

/** Objective kinds a spec can ask for; each needs a template slot with the matching tag. */
export type ObjectiveKindSpec = 'sabotage' | 'steal' | 'rescue';

export const OBJECTIVE_SLOT_TAG: Record<ObjectiveKindSpec, string> = {
  sabotage: 'objective-target',
  steal: 'item',
  rescue: 'prisoner',
};

export interface ObjectiveSpec {
  id: string;
  kind: ObjectiveKindSpec;
  /** Template slot id (see TemplateDef.slots). */
  slot: string;
  title: string;
  description: string;
  required: boolean;
  /** Hidden until HQ reveals it this many seconds into the mission. */
  revealAtSeconds?: number;
}

export type EventTriggerSpec = { type: 'time'; seconds: number } | { type: 'objective'; objectiveId: string } | { type: 'alarm'; level: AlarmLevel };

export type EventActionSpec =
  | { type: 'message'; text: string }
  | { type: 'reinforce'; sector: string; count: number }
  | { type: 'weather'; weather: Weather };

export interface EventSpec {
  id: string;
  trigger: EventTriggerSpec;
  action: EventActionSpec;
}

/**
 * A complete, versioned description of a mission as data. Authored missions, the tutorial and
 * Gemini-generated operations all compile through the same path, so the model can only choose
 * ids, slots, counts and enum values: never coordinates or code.
 */
export interface MissionSpec {
  version: typeof MISSION_SPEC_VERSION;
  id: string;
  title: string;
  templateId: string;
  seed: number;
  env: { timeOfDay: number; weather: Weather };
  density: GuardDensity;
  objectives: ObjectiveSpec[];
  squad: { required: SpecialistId[]; min: number; max: number };
  failAtAlarm: AlarmLevel | null;
  parSeconds: number;
  events: EventSpec[];
  /** Draw dynamic events (patrols, weather shifts, intel) during play. Generated operations use it. */
  dynamicEvents?: boolean;
}

/** A guard position offered by a template; the density picks how many are manned. */
export interface GuardSlot {
  id: string;
  sector: string;
  post?: string;
  route?: string;
  routeStart?: number;
  /** 1 = always manned, 2 = standard and heavy, 3 = heavy only. */
  priority: 1 | 2 | 3;
  rank?: GuardRank;
  temperament?: Temperament;
  lantern?: boolean;
  radio?: boolean;
}

export interface TemplateDef {
  id: string;
  name: string;
  theme: 'coastal' | 'alpine' | 'rail' | 'training';
  version: string;
  /** Player-facing description of the terrain (for briefings and the generator prompt). */
  description: string;
  sectors: string[];
  generate: (seed: number, id: string) => LevelData;
  guards: GuardSlot[];
  reinforcements: { sector: string; pos: Vec2; count: number }[];
  extractionZoneId: string;
  holdingZoneId: string | null;
  /** Default environment and par time for generated missions. */
  defaults: { timeOfDay: number; weather: Weather; parSeconds: number };
  /** Objective slots with a short player-facing description, for generation and validation. */
  slots: { id: string; tag: string; label: string; sector: string }[];
}
