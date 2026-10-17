// Authored glTF models used by the renderer on the High preset (see tools/media/models.ts).
// Every source is CC0 1.0. Poly Haven models are fetched from its API and verified against the
// published MD5 sums; pack archives (Quaternius) are read from a local folder (`--from <dir>`)
// and verified against the SHA-256 pinned here.

export type ModelGroup = 'props' | 'vegetation' | 'characters' | 'weapons';

export interface PolyHavenSource {
  kind: 'polyhaven';
  /** Poly Haven asset id. */
  asset: string;
}

export interface PackSource {
  kind: 'pack';
  /** Archive file name inside the `--from` folder. */
  archive: string;
  sha256: string;
  /** Path of the glTF/GLB inside the archive. */
  file: string;
  pack: string;
  url: string;
  authors: string[];
}

export interface ModelSpec {
  id: string;
  group: ModelGroup;
  source: PolyHavenSource | PackSource;
  /** Keep only these top-level nodes (names as in the source file); everything else is pruned. */
  nodes?: string[];
  /** Triangle budget after simplification. */
  maxTriangles: number;
  /** Largest texture edge in pixels. */
  textureSize: number;
  /** Skinned models keep their skeleton and animations (no flatten/join/simplify). */
  skinned?: boolean;
}

export const MODELS: ModelSpec[] = [
  { id: 'prop.crate', group: 'props', source: { kind: 'polyhaven', asset: 'old_military_crate' }, nodes: ['old_military_crate_a', 'old_military_crate_lid_a', 'old_military_crate_latch_a', 'old_military_crate_loop_a'], maxTriangles: 3000, textureSize: 512 },
  { id: 'prop.fuel-barrel', group: 'props', source: { kind: 'polyhaven', asset: 'Barrel_01' }, maxTriangles: 3000, textureSize: 512 },
  { id: 'prop.barrel', group: 'props', source: { kind: 'polyhaven', asset: 'wooden_barrels_01' }, nodes: ['wooden_barrels_01_barrel01'], maxTriangles: 3000, textureSize: 512 },
  { id: 'prop.lamp-post', group: 'props', source: { kind: 'polyhaven', asset: 'street_lamp_02' }, maxTriangles: 4000, textureSize: 512 },
  { id: 'prop.buoy', group: 'props', source: { kind: 'polyhaven', asset: 'ocean_buoy' }, maxTriangles: 3000, textureSize: 512 },
  { id: 'prop.bench', group: 'props', source: { kind: 'polyhaven', asset: 'painted_wooden_bench' }, maxTriangles: 2000, textureSize: 512 },
  { id: 'veg.shrub', group: 'vegetation', source: { kind: 'polyhaven', asset: 'shrub_04' }, maxTriangles: 6000, textureSize: 512 },
  { id: 'weapon.rifle', group: 'weapons', source: { kind: 'polyhaven', asset: 'bolt_action_rifle_7_62' }, maxTriangles: 2500, textureSize: 256 },
];
