import type { NavProfile } from '../nav/pathfinder';
import type { AbilityId, DifficultyId, Gait, ItemId, SpecialistId, Stance } from './types';

/** Per-specialist gameplay rules. Names, portraits and voices live in the content package. */
export interface SpecialistRules {
  maxHealth: number;
  nav: NavProfile;
  /** Carries bodies at speed (others drag slowly). */
  strong: boolean;
  abilities: AbilityId[];
  inventory: Partial<Record<ItemId, number>>;
}

const COMMON: AbilityId[] = ['door', 'carry', 'drop', 'hide-body', 'pick-up', 'throw-stone', 'pistol', 'first-aid', 'resupply', 'free'];
const COMMON_KIT: Partial<Record<ItemId, number>> = { stone: 3, 'pistol-round': 8, dressing: 1 };
/** Spare rounds carried for teammates' weapons (handed over with Resupply). */
const SPARE_RIFLE: Partial<Record<ItemId, number>> = { 'rifle-round': 2 };
const SPARE_BOLTS: Partial<Record<ItemId, number>> = { 'harpoon-bolt': 2 };

export const SPECIALIST_RULES: Record<SpecialistId, SpecialistRules> = {
  infiltrator: {
    maxHealth: 100,
    nav: { swim: false, climb: true },
    strong: true,
    abilities: [...COMMON, 'takedown', 'knife', 'restrain', 'place-device', 'trigger-device'],
    inventory: { ...COMMON_KIT, ...SPARE_RIFLE, ...SPARE_BOLTS, rope: 6, 'noise-device': 1 },
  },
  recon: {
    maxHealth: 80,
    nav: { swim: false, climb: false },
    strong: false,
    abilities: [...COMMON, 'binoculars', 'rifle', 'dart'],
    inventory: { ...COMMON_KIT, ...SPARE_BOLTS, 'rifle-round': 4, dart: 3 },
  },
  engineer: {
    maxHealth: 110,
    nav: { swim: false, climb: false },
    strong: true,
    abilities: [...COMMON, 'lockpick', 'cut-fence', 'sabotage', 'place-charge', 'restrain'],
    inventory: { ...COMMON_KIT, ...SPARE_RIFLE, ...SPARE_BOLTS, 'wire-cutters': 1, lockpick: 1, charge: 2, rope: 2 },
  },
  deception: {
    maxHealth: 90,
    nav: { swim: false, climb: false },
    strong: false,
    abilities: [...COMMON, 'disguise', 'take-uniform', 'converse', 'sedative'],
    inventory: { ...COMMON_KIT, ...SPARE_RIFLE, ...SPARE_BOLTS, sedative: 3 },
  },
  medic: {
    maxHealth: 90,
    nav: { swim: false, climb: false },
    strong: true,
    abilities: [...COMMON, 'revive', 'chloroform', 'smoke'],
    inventory: { ...COMMON_KIT, ...SPARE_RIFLE, ...SPARE_BOLTS, medkit: 3, chloroform: 3, smoke: 2 },
  },
  marine: {
    maxHealth: 100,
    nav: { swim: true, climb: false },
    strong: true,
    abilities: [...COMMON, 'knife', 'harpoon', 'dive', 'restrain'],
    inventory: { ...COMMON_KIT, ...SPARE_RIFLE, 'harpoon-bolt': 4, rope: 2 },
  },
  // Carries no weapon at all: no pistol, blade or takedown. Lives on his cover until the alarm.
  spy: {
    maxHealth: 80,
    nav: { swim: false, climb: false },
    strong: false,
    abilities: [...COMMON.filter((a) => a !== 'pistol'), 'chat'],
    inventory: { stone: 3, dressing: 1 },
  },
};

/** Alarm level from which the spy's cover is blown for the rest of the mission (sector alert). */
export const SPY_COVER_ALARM = 3;

export const GUARD_NAV: NavProfile = { swim: false, climb: false };

/** Movement speed in m/s before surface modifiers. */
export function operativeSpeed(stance: Stance, gait: Gait, swimming: boolean): number {
  if (swimming) return 1.3;
  if (stance === 'prone') return 0.55;
  if (stance === 'crouch') return gait === 'run' ? 2.2 : 1.1;
  return gait === 'run' ? 3.6 : 1.6;
}

export const GUARD_SPEED = { patrol: 1.3, walk: 1.7, run: 3.7 } as const;

export interface DifficultyRules {
  /** Multiplier on suspicion gain. */
  detection: number;
  /** Suspicion lost per second when the target is out of sight. */
  decay: number;
  koSeconds: number;
  /** Seconds a downed operative survives before dying (0 = hits kill outright). */
  bleedOutSeconds: number;
  guardDamage: readonly [number, number];
  guardHitChance: number;
  aimSeconds: number;
  searchSeconds: number;
  footprintSeconds: number;
  /** Sound threshold above the noise floor at which relaxed guards notice something. */
  hearingMargin: number;
}

export const DIFFICULTY: Record<DifficultyId, DifficultyRules> = {
  standard: {
    detection: 1,
    decay: 25,
    koSeconds: 120,
    bleedOutSeconds: 45,
    guardDamage: [35, 55],
    guardHitChance: 0.5,
    aimSeconds: 0.9,
    searchSeconds: 35,
    footprintSeconds: 90,
    hearingMargin: 3,
  },
  veteran: {
    detection: 1.5,
    decay: 15,
    koSeconds: 60,
    bleedOutSeconds: 0,
    guardDamage: [60, 95],
    guardHitChance: 0.65,
    aimSeconds: 0.6,
    searchSeconds: 55,
    footprintSeconds: 150,
    hearingMargin: 0,
  },
};

/** Sound levels in dB at 1 m. */
export const NOISE_DB = {
  door: 38,
  scuffle: 45,
  knife: 42,
  bodyFall: 50,
  impact: 58,
  device: 70,
  suppressedShot: 70,
  harpoon: 45,
  dart: 50,
  gunshot: 112,
  explosion: 140,
  shout: 85,
  tool: 32,
} as const;

/** Global ambient noise floor by weather (dB). Local floors (surf, machinery) come from the level. */
export const WEATHER_NOISE_FLOOR: Record<string, number> = { clear: 28, fog: 28, rain: 38, snow: 24 };

/** Ambient light by hour of day: 0 = night, 1 = full daylight. */
export function ambientLightAt(hour: number, weather: string): number {
  const h = ((hour % 24) + 24) % 24;
  let light: number;
  if (h < 5 || h >= 21) light = 0.12;
  else if (h < 7) light = 0.12 + ((h - 5) / 2) * 0.6;
  else if (h < 18) light = 1;
  else light = 1 - ((h - 18) / 3) * 0.88;
  if (weather === 'rain' || weather === 'fog') light *= 0.75;
  return Math.max(0.08, Math.min(1, light));
}
