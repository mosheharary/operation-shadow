// Authored glTF models used by the renderer on the High preset (see tools/media/models.ts).
// Every source is CC0 1.0. Poly Haven models are fetched from its API and verified against the
// published MD5 sums; pack archives (Quaternius) are read from a local folder (`--from <dir>`)
// and verified against the SHA-256 pinned here.

export type ModelGroup = 'props' | 'vegetation' | 'characters';

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
  /** Image URIs to replace (missing or alternative textures), relative to the glTF file. */
  images?: Record<string, string>;
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
  /**
   * 'static' (default): flattened, joined and simplified. 'skinned': keeps its skeleton.
   * 'animations': keeps only the skeleton and the clips in `clips`.
   */
  process?: 'static' | 'skinned' | 'animations';
  /** Skinned models only: simplify to `maxTriangles` anyway (shadow-casting LOD bodies). */
  simplify?: boolean;
  /** Animation clips to keep: source name → name used by the game. */
  clips?: Record<string, string>;
  /** Same clips with root motion (inside the same archive): measures each clip's ground speed. */
  rootMotionFile?: string;
}

const UAL: Omit<PackSource, 'file'> = {
  kind: 'pack',
  archive: 'Universal Animation Library[Standard].zip',
  sha256: 'cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724',
  pack: 'Universal Animation Library (Standard)',
  url: 'https://quaternius.com/packs/universalanimationlibrary.html',
  authors: ['Quaternius'],
};

const UBC: Omit<PackSource, 'file'> = {
  kind: 'pack',
  archive: 'Universal Base Characters[Standard].zip',
  sha256: 'fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40',
  pack: 'Universal Base Characters (Standard)',
  url: 'https://quaternius.com/packs/universalbasecharacters.html',
  authors: ['Quaternius'],
};

const BODY = 'Universal Base Characters[Standard]/Base Characters/Godot - UE';
const HAIR = 'Universal Base Characters[Standard]/Hairstyles/Origin at 0/glTF (Godot)';

/** Hair, beard and eyebrow meshes (static, in character space; attached to the head bone). */
const hair = (id: string, file: string, textureSize = 256): ModelSpec => ({
  id: `char.hair-${id}`,
  group: 'characters',
  source: { ...UBC, file: `${HAIR}/${file}.gltf` },
  maxTriangles: 3000,
  textureSize,
});

export const MODELS: ModelSpec[] = [
  { id: 'prop.crate', group: 'props', source: { kind: 'polyhaven', asset: 'old_military_crate' }, nodes: ['old_military_crate_a', 'old_military_crate_lid_a', 'old_military_crate_latch_a', 'old_military_crate_loop_a'], maxTriangles: 3000, textureSize: 512 },
  { id: 'prop.fuel-barrel', group: 'props', source: { kind: 'polyhaven', asset: 'Barrel_01' }, maxTriangles: 3000, textureSize: 512 },
  { id: 'prop.barrel', group: 'props', source: { kind: 'polyhaven', asset: 'wooden_barrels_01' }, nodes: ['wooden_barrels_01_barrel01'], maxTriangles: 3000, textureSize: 512 },
  { id: 'prop.lamp-post', group: 'props', source: { kind: 'polyhaven', asset: 'street_lamp_02' }, maxTriangles: 4000, textureSize: 512 },
  { id: 'prop.buoy', group: 'props', source: { kind: 'polyhaven', asset: 'ocean_buoy' }, maxTriangles: 3000, textureSize: 512 },
  { id: 'prop.bench', group: 'props', source: { kind: 'polyhaven', asset: 'painted_wooden_bench' }, maxTriangles: 2000, textureSize: 512 },
  { id: 'veg.shrub', group: 'vegetation', source: { kind: 'polyhaven', asset: 'shrub_04' }, maxTriangles: 2400, textureSize: 512 },
  // Base bodies (one skeleton shared with the animation library). The light skin texture is
  // tinted per character; the uniform is painted over the body in the shader.
  {
    id: 'char.body-male',
    group: 'characters',
    source: { ...UBC, file: `${BODY}/Superhero_Male_FullBody.gltf`, images: { 'T_Hair_1_Normal_png.png': 'T_Hair_1_Normal.png', 'T_Eye_Normal_png.png': 'T_Eye_Normal.png', 'T_Superhero_Male_Dark.png': '../Textures/T_Superhero_Male_Ligh.png' } },
    process: 'skinned',
    maxTriangles: 16000,
    textureSize: 512,
  },
  {
    id: 'char.body-female',
    group: 'characters',
    source: { ...UBC, file: `${BODY}/Superhero_Female_FullBody.gltf`, images: { 'T_Eye_Normal_png.png': 'T_Eye_Normal.png', 'T_Superhero_Female_Dark_BaseColor.png': '../Textures/T_Superhero_Female_Light_BaseColor.png' } },
    process: 'skinned',
    maxTriangles: 16000,
    textureSize: 512,
  },
  // Low-detail bodies that cast the characters' shadows (same skeleton and weights).
  {
    id: 'char.body-male-lod1',
    group: 'characters',
    source: { ...UBC, file: `${BODY}/Superhero_Male_FullBody.gltf`, images: { 'T_Hair_1_Normal_png.png': 'T_Hair_1_Normal.png', 'T_Eye_Normal_png.png': 'T_Eye_Normal.png' } },
    nodes: ['Armature'],
    process: 'skinned',
    simplify: true,
    maxTriangles: 3500,
    textureSize: 16,
  },
  {
    id: 'char.body-female-lod1',
    group: 'characters',
    source: { ...UBC, file: `${BODY}/Superhero_Female_FullBody.gltf`, images: { 'T_Eye_Normal_png.png': 'T_Eye_Normal.png' } },
    nodes: ['Armature'],
    process: 'skinned',
    simplify: true,
    maxTriangles: 3500,
    textureSize: 16,
  },
  hair('short', 'Hair_SimpleParted'),
  hair('cropped', 'Hair_Buzzed'),
  hair('cropped-female', 'Hair_BuzzedFemale'),
  hair('bob', 'Hair_Buns'),
  hair('beard', 'Hair_Beard'),
  {
    id: 'char.animations',
    group: 'characters',
    source: { ...UAL, file: 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb' },
    rootMotionFile: 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard_RM.glb',
    process: 'animations',
    maxTriangles: 0,
    textureSize: 0,
    clips: {
      Idle_Loop: 'Idle',
      Walk_Loop: 'Walk',
      Jog_Fwd_Loop: 'Run',
      Crouch_Idle_Loop: 'CrouchIdle',
      Crouch_Fwd_Loop: 'CrouchWalk',
      Swim_Fwd_Loop: 'Swim',
      Swim_Idle_Loop: 'SwimIdle',
      Death01: 'Death',
      Pistol_Aim_Neutral: 'Aim',
      Idle_Talking_Loop: 'Talk',
      Idle_Torch_Loop: 'Lantern',
      Push_Loop: 'Carry',
      Interact: 'Interact',
    },
  },
];
