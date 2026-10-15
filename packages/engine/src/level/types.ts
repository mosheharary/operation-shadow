import type { Vec2 } from '../core/math';
import type { ObjectSpawn } from '../sim/mission';

/** Ground surface material: drives footstep noise, footprints and rendering. */
export enum Surface {
  Grass = 0,
  Dirt = 1,
  Gravel = 2,
  Sand = 3,
  Snow = 4,
  Mud = 5,
  Stone = 6,
  Concrete = 7,
  Wood = 8,
  Metal = 9,
  ShallowWater = 10,
  DeepWater = 11,
  Rock = 12,
}

export const SURFACE_COUNT = 13;

/** Per-cell bit flags. */
export const CellFlag = {
  /** Walkable on foot (subject to dynamic blocks). */
  Walkable: 1 << 0,
  /** Shallow water: walkable but slow and loud. */
  Shallow: 1 << 1,
  /** Deep water: swimmers only. */
  Deep: 1 << 2,
  /** Inside a building (roofed): affects light, ambience and sound envelope. */
  Indoor: 1 << 3,
  /** Leaves footprints (sand, snow, mud). */
  Prints: 1 << 4,
  /** Steep ground or a wall face that a climber may cross via a climb link. */
  Steep: 1 << 5,
  /** Part of an extraction zone. */
  Extraction: 1 << 6,
  /** Off the playable map. */
  OutOfBounds: 1 << 7,
} as const;

/**
 * Vertical occluder span above the cell's ground height, in metres. Two spans per cell let a
 * window be modelled as a wall with a gap at eye height.
 */
export interface OccluderSpans {
  /** [bottom, top] of the first span relative to ground (0 = none). */
  lowBottom: Float32Array;
  lowTop: Float32Array;
  highBottom: Float32Array;
  highTop: Float32Array;
}

export type NavLinkKind = 'ladder' | 'climb' | 'stairs' | 'vault';

/** A traversal between two cells that is not a plain grid step (e.g. climbing a wall). */
export interface NavLink {
  id: string;
  kind: NavLinkKind;
  a: number;
  b: number;
  /** Seconds to traverse (at walking pace). */
  duration: number;
  /** Capability required to use the link (undefined = anyone). */
  requires?: 'climb';
  bidirectional: boolean;
}

export type StructureKind =
  | 'house'
  | 'office'
  | 'barracks'
  | 'bunker'
  | 'radio-hut'
  | 'warehouse'
  | 'watchtower'
  | 'gun-emplacement'
  | 'pier'
  | 'wall'
  | 'fence'
  | 'sandbags'
  | 'cliff-stairs';

/** Rendering and gameplay description of a generated structure. */
export interface StructureDef {
  id: string;
  kind: StructureKind;
  /** Centre position on the ground plane. */
  pos: Vec2;
  /** Footprint size (x along local width, z along local depth) in metres. */
  size: Vec2;
  /** Rotation in radians around +y (0, ±π/2, π for axis-aligned buildings). */
  rotation: number;
  /** Ground height at the structure base. */
  baseHeight: number;
  /** Wall height (or post height for fences/towers). */
  height: number;
  material: 'plaster' | 'stone' | 'timber' | 'concrete' | 'brick' | 'wood' | 'metal' | 'chainlink' | 'sandbag';
  roof?: 'gable' | 'flat' | 'none';
  /** Door openings in world coordinates (door objects live in the world state). */
  doors?: Vec2[];
  windows?: Vec2[];
  /** For fences/walls: polyline points. */
  path?: Vec2[];
  regionId?: number;
}

export type PropKind =
  | 'crate'
  | 'barrel'
  | 'fuel-barrel'
  | 'net'
  | 'rowboat'
  | 'fishing-boat'
  | 'lamp-post'
  | 'searchlight'
  | 'sandbag'
  | 'tree-pine'
  | 'tree-oak'
  | 'bush'
  | 'rock'
  | 'tall-grass'
  | 'antenna'
  | 'gun'
  | 'truck'
  | 'bench'
  | 'bollard'
  | 'buoy';

export interface PropDef {
  id: string;
  kind: PropKind;
  pos: Vec2;
  rotation: number;
  scale: number;
  height: number;
  /** Whether the prop blocks movement (already baked into the grid). */
  solid: boolean;
}

export interface LightDef {
  id: string;
  kind: 'lamp' | 'window' | 'fire' | 'searchlight';
  pos: Vec2;
  height: number;
  radius: number;
  intensity: number;
  color: string;
}

export interface PatrolRouteDef {
  id: string;
  points: Vec2[];
  /** Seconds to wait at each point (same length as points). */
  waits: number[];
  loop: boolean;
}

export interface PostDef {
  id: string;
  pos: Vec2;
  facing: number;
  /** Optional scan: sweep facing ± arc over period seconds. */
  sweepArc?: number;
  sweepPeriod?: number;
  /** Elevated post (tower platform): eye height bonus in metres. */
  elevation?: number;
}

export interface ZoneDef {
  id: string;
  kind: 'insertion' | 'extraction' | 'holding' | 'sector' | 'restricted';
  /** Axis-aligned rectangle (min/max corners). */
  min: Vec2;
  max: Vec2;
  label?: string;
}

/** Placement slots used by mission specs (objectives, items, opportunities). */
export interface SlotDef {
  id: string;
  tags: string[];
  pos: Vec2;
  facing: number;
  indoor: boolean;
}

/** Static, generated level. Arrays are indexed by cell = row * cols + col. */
export interface LevelData {
  version: 1;
  id: string;
  templateId: string;
  seed: number;
  generatorVersion: string;
  width: number;
  depth: number;
  cellSize: number;
  cols: number;
  rows: number;
  /** Heightfield vertices at 1 m spacing: (width + 1) x (depth + 1), row-major by z. */
  heightfield: Float32Array;
  heightfieldStep: number;
  /** Ground height sampled at each cell centre. */
  cellHeight: Float32Array;
  surface: Uint8Array;
  flags: Uint8Array;
  occluders: OccluderSpans;
  /** Vegetation / clutter concealment 0..255 (reduces visibility of crouched/prone targets). */
  concealment: Uint8Array;
  /** Static light 0..255 (lamps, windows) before ambient light is added. */
  staticLight: Uint8Array;
  /** Local ambient noise floor in dB (surf, machinery). 0 = use the global floor. */
  noiseFloor: Uint8Array;
  /** Region id per cell (0 = outdoors, >0 = building/structure id index). */
  region: Uint16Array;
  seaLevel: number;
  links: NavLink[];
  structures: StructureDef[];
  props: PropDef[];
  lights: LightDef[];
  routes: PatrolRouteDef[];
  posts: PostDef[];
  zones: ZoneDef[];
  slots: SlotDef[];
  /** Points guards visit when searching (corners, doorways, cover). */
  searchNodes: Vec2[];
  /** Template objects every mission on this level instantiates (doors, fences, bells, hiding places). */
  fixtures: ObjectSpawn[];
}
