import * as THREE from 'three';
import { regionOfBone, Region, tagRegions } from './body-material';
import type { ClipName } from './clips';

export type HairId = 'short' | 'cropped' | 'cropped-female' | 'bob' | 'beard';

/** One base body: its scene (skinned meshes and skeleton) and the rest-pose bone frames. */
export interface BodySource {
  scene: THREE.Object3D;
  /** Body height in its own units (metres). */
  height: number;
  /** Low-detail body geometry (same skeleton and weights) that casts the shadow. */
  shadow: THREE.BufferGeometry | null;
}

/** Everything the authored characters share: bodies, hair, and the animation clips. */
export interface CharacterLibrary {
  male: BodySource;
  female: BodySource;
  hair: Record<HairId, THREE.Object3D>;
  /** Whole-body clips. */
  full: Map<ClipName, THREE.AnimationClip>;
  /** The same clips limited to the legs and hips (under an upper-body clip). */
  lower: Map<ClipName, THREE.AnimationClip>;
  /** The same clips limited to the spine, arms and head. */
  upper: Map<ClipName, THREE.AnimationClip>;
  /** Ground speed each locomotion clip was authored at (m/s). */
  speeds: Partial<Record<ClipName, number>>;
}

/** Bones that belong to the upper body (spine above the waist, arms, head). */
function isUpper(bone: string): boolean {
  const region = regionOfBone(bone);
  return bone !== 'spine_01' && (region === Region.Torso || region === Region.Head || region === Region.Neck || region === Region.Hands || region === Region.Forearms) && bone !== 'root';
}

function filterClip(clip: THREE.AnimationClip, keep: (bone: string) => boolean, suffix: string): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => keep(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
  return new THREE.AnimationClip(`${clip.name}${suffix}`, clip.duration, tracks);
}

function prepareBody(scene: THREE.Object3D, lod: THREE.Object3D | null): BodySource {
  let height = 1.8;
  let shadow: THREE.BufferGeometry | null = null;
  lod?.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) shadow = (object as THREE.SkinnedMesh).geometry;
  });
  scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    // Bind-pose bounds are wrong once animated: the rig culls itself instead.
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (mesh.geometry.getAttribute('position').count > 5000) {
      tagRegions(mesh);
      mesh.geometry.computeBoundingBox();
      height = mesh.geometry.boundingBox!.max.y - mesh.geometry.boundingBox!.min.y;
    }
  });
  return { scene, height, shadow };
}

export function buildLibrary(input: {
  male: THREE.Object3D;
  female: THREE.Object3D;
  maleLod: THREE.Object3D | null;
  femaleLod: THREE.Object3D | null;
  hair: Record<HairId, THREE.Object3D>;
  clips: THREE.AnimationClip[];
  speeds: Partial<Record<string, number>>;
}): CharacterLibrary {
  const full = new Map<ClipName, THREE.AnimationClip>();
  const lower = new Map<ClipName, THREE.AnimationClip>();
  const upper = new Map<ClipName, THREE.AnimationClip>();
  for (const clip of input.clips) {
    const name = clip.name as ClipName;
    full.set(name, clip);
    lower.set(name, filterClip(clip, (bone) => !isUpper(bone), '-lower'));
    upper.set(name, filterClip(clip, isUpper, '-upper'));
  }
  return {
    male: prepareBody(input.male, input.maleLod),
    female: prepareBody(input.female, input.femaleLod),
    hair: input.hair,
    full,
    lower,
    upper,
    speeds: input.speeds as Partial<Record<ClipName, number>>,
  };
}
