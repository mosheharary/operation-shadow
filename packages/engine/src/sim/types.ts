import type { RngState } from '../core/rng';
import type { Vec2 } from '../core/math';
import type { NavLink } from '../level/types';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const seconds = (s: number): number => Math.round(s * TICK_RATE);

export type SpecialistId = 'infiltrator' | 'recon' | 'engineer' | 'deception' | 'medic' | 'marine';
export const SPECIALISTS: readonly SpecialistId[] = ['infiltrator', 'recon', 'engineer', 'deception', 'medic', 'marine'];

export type Stance = 'stand' | 'crouch' | 'prone';
export type Gait = 'walk' | 'run';
export type DifficultyId = 'standard' | 'veteran';
export type Weather = 'clear' | 'rain' | 'fog' | 'snow';

export type ItemId =
  | 'rope'
  | 'stone'
  | 'noise-device'
  | 'rifle-round'
  | 'dart'
  | 'wire-cutters'
  | 'lockpick'
  | 'charge'
  | 'uniform'
  | 'sedative'
  | 'medkit'
  | 'chloroform'
  | 'smoke'
  | 'harpoon-bolt'
  | 'dressing'
  | 'pistol-round'
  | 'codebook'
  | 'key';

export type AbilityId =
  | 'takedown'
  | 'knife'
  | 'restrain'
  | 'carry'
  | 'drop'
  | 'hide-body'
  | 'door'
  | 'lockpick'
  | 'cut-fence'
  | 'sabotage'
  | 'place-charge'
  | 'pick-up'
  | 'throw-stone'
  | 'place-device'
  | 'trigger-device'
  | 'binoculars'
  | 'rifle'
  | 'dart'
  | 'disguise'
  | 'take-uniform'
  | 'converse'
  | 'sedative'
  | 'revive'
  | 'first-aid'
  | 'chloroform'
  | 'smoke'
  | 'pistol'
  | 'harpoon'
  | 'dive'
  | 'free';

export type NoiseKind =
  | 'footstep'
  | 'door'
  | 'scuffle'
  | 'body-fall'
  | 'impact'
  | 'device'
  | 'suppressed-shot'
  | 'harpoon'
  | 'gunshot'
  | 'explosion'
  | 'shout'
  | 'alarm-shout'
  | 'tool';

export interface NoiseEvent {
  id: number;
  pos: Vec2;
  db: number;
  kind: NoiseKind;
  sourceId: string | null;
  tick: number;
}

// ── Operatives ────────────────────────────────────────────────────────────────────────────────

export type AbilityTarget =
  /** `at`: where on the entity the player clicked (which stretch of a long fence). */
  | { kind: 'entity'; id: string; at?: Vec2 }
  | { kind: 'point'; pos: Vec2 }
  | { kind: 'self' };

export interface MovePathPoint extends Vec2 {
  link?: NavLink;
}

export type Action =
  | { kind: 'move'; path: MovePathPoint[]; index: number; gait: Gait; target: Vec2; linkProgress: number }
  | { kind: 'approach'; abilityId: AbilityId; target: AbilityTarget; path: MovePathPoint[]; index: number; gait: Gait; repathTick: number; linkProgress: number }
  | { kind: 'channel'; abilityId: AbilityId; target: AbilityTarget; remaining: number; total: number; anchor: Vec2; applied: boolean }
  | { kind: 'converse'; guardId: string }
  /** Planning mode: holds the queue until the player gives the signal. */
  | { kind: 'wait-signal' };

/** Planning mode: clear this operative's orders when the condition occurs after it was set. */
export interface AbortRule {
  on: 'spotted' | 'alarm';
  since: number;
  alarmAt: AlarmLevel;
}

export type OperativeStatus = 'active' | 'downed' | 'dead' | 'captured' | 'extracted';

export interface Operative {
  id: string;
  role: SpecialistId;
  pos: Vec2;
  facing: number;
  stance: Stance;
  gait: Gait;
  health: number;
  maxHealth: number;
  status: OperativeStatus;
  /** Ticks until death while downed (0 = not bleeding). */
  bleedOut: number;
  inventory: Partial<Record<ItemId, number>>;
  carrying: string | null;
  disguised: boolean;
  /** While disguised, actions before this tick count as suspicious. */
  suspiciousUntil: number;
  submerged: boolean;
  /** Guard escorting this operative after capture. */
  escortedBy: string | null;
  action: Action | null;
  queue: Action[];
  /** Planning-mode abort condition (absent in older saves = none). */
  abortRule?: AbortRule | null;
  /** Tick a guard last spotted this operative. */
  lastSpottedTick?: number;
  cooldowns: Partial<Record<AbilityId, number>>;
  stride: number;
  /** Tick of the last movement, for the visibility motion factor. */
  lastMoveTick: number;
  lastGait: Gait;
  /** Guard ids that currently have suspicion of this operative ≥ the observe threshold. */
  noticedBy: string[];
}

// ── Guards ────────────────────────────────────────────────────────────────────────────────────

export type GuardStateName =
  | 'post'
  | 'patrol'
  | 'observe'
  | 'suspicious'
  | 'investigate'
  | 'search'
  | 'challenge'
  | 'alerted'
  | 'combat'
  | 'return'
  | 'escort'
  | 'revive'
  | 'distracted';

export type Temperament = 'passive' | 'standard' | 'strict' | 'aggressive';
export type GuardRank = 'soldier' | 'nco' | 'officer';
export type StimulusKind = 'sight' | 'noise' | 'body' | 'tracks' | 'shout' | 'alarm';

export interface Stimulus {
  kind: StimulusKind;
  pos: Vec2;
  tick: number;
  salience: number;
  sourceId: string | null;
  noise?: NoiseKind;
}

export interface SuspicionEntry {
  targetId: string;
  value: number;
  lastSeen: Vec2;
  lastSeenTick: number;
}

export type GuardStatus = 'active' | 'ko' | 'restrained' | 'dead';

export interface Guard {
  id: string;
  archetype: string;
  rank: GuardRank;
  temperament: Temperament;
  pos: Vec2;
  facing: number;
  /** Head yaw relative to the body while scanning. */
  look: number;
  eyeElevation: number;
  health: number;
  status: GuardStatus;
  koUntil: number;
  state: GuardStateName;
  stateSince: number;
  postId: string | null;
  routeId: string | null;
  routeIndex: number;
  waitUntil: number;
  home: { pos: Vec2; facing: number };
  path: Vec2[] | null;
  pathIndex: number;
  suspicion: SuspicionEntry[];
  /** Newest unhandled stimulus (cleared when a state transition consumes it). */
  focus: Stimulus | null;
  memory: Stimulus[];
  /** Where the current investigation/search/observation is directed. */
  goal: Vec2 | null;
  goalKind: StimulusKind | null;
  goalSource: string | null;
  /** Alarm bell the guard is running to. */
  bellId: string | null;
  /** Persistent wariness after incidents (0..1). */
  alertness: number;
  targetId: string | null;
  aimUntil: number;
  nextShotTick: number;
  lostSightTick: number;
  searchPoints: Vec2[];
  searchIndex: number;
  searchUntil: number;
  lookUntil: number;
  distractedBy: string | null;
  distractedUntil: number;
  escorting: string | null;
  challengeStillSince: number;
  lastPerceptionTick: number;
  sector: string;
  radio: boolean;
  carriesLantern: boolean;
  carriedBy: string | null;
  hiddenIn: string | null;
  /** Body already reported, so it does not trigger repeated alarms. */
  found: boolean;
  tagged: boolean;
  barked: boolean;
  /** Alarm reinforcements only: the barracks they deployed from and return to when the alarm stands down. */
  barracks?: Vec2;
}

// ── World objects ─────────────────────────────────────────────────────────────────────────────

interface ObjectBase {
  id: string;
  pos: Vec2;
}

export interface DoorObject extends ObjectBase {
  type: 'door';
  cells: number[];
  open: boolean;
  locked: boolean;
}

export interface FenceObject extends ObjectBase {
  type: 'fence';
  cells: number[];
  /** Gap cells opened by cutting (empty until cut). */
  cutCells: number[];
}

export interface ItemObject extends ObjectBase {
  type: 'item';
  item: ItemId;
  amount: number;
  takenBy: string | null;
}

export interface ContainerObject extends ObjectBase {
  type: 'container';
  capacity: number;
  contents: string[];
}

export interface SabotageTarget extends ObjectBase {
  type: 'alarm-bell' | 'radio' | 'searchlight' | 'objective-target';
  label: string;
  sector: string;
  sabotaged: boolean;
  destroyed: boolean;
  /** Searchlight sweep state: current heading oscillates around baseHeading. */
  heading?: number;
  baseHeading?: number;
  sweepArc?: number;
  sweepPeriod?: number;
  range?: number;
}

export interface DeviceObject extends ObjectBase {
  type: 'device';
  owner: string;
  triggers: number;
}

export interface ChargeObject extends ObjectBase {
  type: 'charge';
  owner: string;
  detonateAt: number;
}

export interface PrisonerObject extends ObjectBase {
  type: 'prisoner';
  freed: boolean;
  following: string | null;
  extracted: boolean;
  alive: boolean;
}

export type WorldObject =
  | DoorObject
  | FenceObject
  | ItemObject
  | ContainerObject
  | SabotageTarget
  | DeviceObject
  | ChargeObject
  | PrisonerObject;

// ── Mission, alarm, director, stats ───────────────────────────────────────────────────────────

export type AlarmLevel = 0 | 1 | 2 | 3 | 4;

export interface AlarmState {
  /** Effective level: max of the persistent level and what guards are currently doing. */
  level: AlarmLevel;
  /** Escalations (sector/full alert) that persist and decay slowly. */
  persistent: AlarmLevel;
  since: number;
  peak: AlarmLevel;
  floor: AlarmLevel;
  lastEscalationTick: number;
  /** Last time a guard saw or fought the squad during a sector or full alert. */
  lastContactTick: number;
  reinforcementsSent: number;
  sirens: boolean;
}

export type ObjectiveStatus = 'hidden' | 'active' | 'completed' | 'failed';

export interface ObjectiveState {
  id: string;
  status: ObjectiveStatus;
  completedTick: number | null;
}

export interface Footprint {
  pos: Vec2;
  heading: number;
  tick: number;
  ownerId: string;
}

export interface SmokeCloud {
  id: string;
  pos: Vec2;
  radius: number;
  height: number;
  until: number;
}

export interface MissionStats {
  detections: number;
  alarmsRaised: number;
  peakAlarm: AlarmLevel;
  kills: number;
  knockouts: number;
  restrained: number;
  bodiesFound: number;
  shotsFired: number;
  injuries: number;
  downs: number;
  captures: number;
  itemsUsed: Partial<Record<ItemId, number>>;
  distance: number;
}

export interface LogEntry {
  tick: number;
  kind: 'info' | 'warning' | 'danger' | 'success';
  text: string;
}

export type OutcomeCode = 'extracted' | 'operative-killed' | 'all-captured' | 'alarm-limit' | 'objective-impossible';

export interface SimState {
  schemaVersion: 1;
  missionId: string;
  levelId: string;
  seed: number;
  difficulty: DifficultyId;
  tick: number;
  rng: RngState;
  status: 'running' | 'success' | 'failed';
  outcome: { code: OutcomeCode; message: string; tick: number } | null;
  env: { timeOfDay: number; weather: Weather; ambientLight: number; noiseFloor: number };
  operatives: Operative[];
  guards: Guard[];
  objects: WorldObject[];
  footprints: Footprint[];
  noises: NoiseEvent[];
  smoke: SmokeCloud[];
  alarm: AlarmState;
  objectives: ObjectiveState[];
  director: {
    fired: string[];
    /** Dynamic-event deck: next draw, complications played (budgeted per difficulty), own RNG stream. */
    deck?: { nextTick: number; drawn: number; complications: number; rng: RngState };
  };
  stats: MissionStats;
  log: LogEntry[];
  nextId: number;
}
