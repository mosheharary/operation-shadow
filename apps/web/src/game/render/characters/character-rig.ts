import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildAttachments, type FigureLook, type FigurePose } from '../figure';
import type { UnitRig } from '../rig';
import { bodyMaterial } from './body-material';
import { type ClipChoice, clipsFor, type ClipName, LOCOMOTION } from './clips';
import type { CharacterLibrary, HairId } from './library';

/** Height of the procedural figure the game was tuned for (metres, before the look's own height). */
const FIGURE_HEIGHT = 1.78;
/** The procedural head's eyes, from its kit origin (the neck joint): up and forward, metres. */
const FIGURE_EYES = { up: 0.128, forward: 0.09 };
const FADE = 0.22;

/**
 * Where the procedural kit hangs on the skeleton: the bone it follows, the bone whose rest
 * position is the kit's origin ('eyes': placed from the eyes, see below), an offset from there
 * (model space, metres) and a scale (kit axes: forward, up, sideways).
 */
const ANCHORS = {
  head: { bone: 'Head', origin: 'eyes', offset: [0, 0, 0], scale: [1.02, 1, 1] },
  chest: { bone: 'spine_03', origin: 'spine_01', offset: [0, -0.04, -0.012], scale: [0.86, 0.98, 1.04] },
  pelvis: { bone: 'pelvis', origin: 'pelvis', offset: [0, -0.07, 0], scale: [1.0, 1, 1.04] },
  lantern: { bone: 'hand_l', origin: 'hand_l', offset: [0, -0.1, 0.02], scale: [1, 1, 1] },
} as const;

type AnchorName = keyof typeof ANCHORS;

function hairFor(look: FigureLook, female: boolean): HairId | null {
  if (look.headgear === 'hood') return null;
  if (look.hairStyle === 'bob') return 'bob';
  if (look.hairStyle === 'short') return 'short';
  return female ? 'cropped-female' : 'cropped';
}

const materialCache = new Map<string, THREE.Material>();

function lookKey(look: FigureLook): string {
  return JSON.stringify(look);
}

/** A skinned, animated character from the shared library, dressed and kitted for `look`. */
export function createCharacterRig(look: FigureLook, lib: CharacterLibrary): UnitRig {
  const female = (look.build ?? 1) < 0.95;
  const source = female ? lib.female : lib.male;
  const root = new THREE.Group();
  // Turned to face +x like the procedural figure (glTF characters face +z).
  const inner = new THREE.Group();
  // Yaw first, then pitch about the character's own side axis (laying it face down).
  inner.rotation.order = 'YXZ';
  inner.rotation.y = Math.PI / 2;
  const scale = (FIGURE_HEIGHT * (look.height ?? 1)) / source.height;
  const width = female ? 1 : (look.build ?? 1);
  inner.scale.set(scale * width, scale, scale * width);
  root.add(inner);
  const body = cloneSkinned(source.scene);
  inner.add(body);

  const key = lookKey(look);
  const owned: THREE.Material[] = [];
  body.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.userData = {};
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mesh.geometry.getAttribute('aRegion')) {
      const cacheKey = `body:${female}:${key}`;
      let painted = materialCache.get(cacheKey);
      if (!painted) {
        painted = bodyMaterial(mat, look);
        materialCache.set(cacheKey, painted);
      }
      mesh.material = painted;
    } else if (/hair/i.test(mat.name)) {
      // Eyebrows take the hair colour.
      const tinted = mat.clone();
      tinted.color.set(look.hair).multiplyScalar(2.2);
      mesh.material = tinted;
      owned.push(tinted);
    }
  });

  const bones = new Map<string, THREE.Object3D>();
  body.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones.set(object.name, object);
  });

  // Rest-pose frames of the anchor bones in `inner` space (before any animation runs).
  inner.updateMatrixWorld(true);
  const innerInverse = new THREE.Matrix4().copy(inner.matrixWorld).invert();
  const rest = (name: string) => new THREE.Matrix4().multiplyMatrices(innerInverse, bones.get(name)!.matrixWorld);

  /** Head kit origin: the procedural figure's neck joint, placed so its eyes meet these eyes. */
  const eyesOrigin = () => {
    const box = new THREE.Box3();
    body.traverse((object) => {
      if (object.name === 'Eyes' && (object as THREE.Mesh).isMesh) box.setFromObject(object);
    });
    const eyes = box.isEmpty() ? new THREE.Vector3(0, source.height * 0.94, 0.07) : box.getCenter(new THREE.Vector3()).applyMatrix4(innerInverse);
    const k = (look.height ?? 1) / inner.scale.y;
    return eyes.sub(new THREE.Vector3(0, FIGURE_EYES.up * k, FIGURE_EYES.forward * k));
  };

  /** Hangs an object built in the procedural figure's frame (facing +x) on a bone. */
  const hang = (object: THREE.Object3D, anchor: AnchorName) => {
    const a = ANCHORS[anchor];
    const bone = bones.get(a.bone);
    if (!bone) return;
    const origin = a.origin === 'eyes' ? eyesOrigin() : new THREE.Vector3().setFromMatrixPosition(rest(a.origin));
    origin.add(new THREE.Vector3(...a.offset));
    // Kit frame in inner space: at the origin, turned from +x to +z, undone of the body's scale.
    const frame = new THREE.Matrix4().compose(origin, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), new THREE.Vector3(...a.scale).divide(inner.scale).multiplyScalar(look.height ?? 1));
    const local = new THREE.Matrix4().copy(rest(a.bone)).invert().multiply(frame);
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(local);
    holder.add(object);
    bone.add(holder);
    return holder;
  };

  const kit = buildAttachments(look);
  if (kit.head) hang(kit.head, 'head');
  if (kit.chest) hang(kit.chest, 'chest');
  if (kit.pelvis) hang(kit.pelvis, 'pelvis');
  const skirt = kit.skirt;
  if (skirt) hang(skirt, 'pelvis');
  const weapon = kit.weapon;
  if (weapon) hang(weapon, 'chest');
  const lantern = kit.lantern;
  if (lantern) hang(lantern, 'lantern');
  for (const mesh of [kit.head, kit.chest, kit.pelvis, skirt]) if (mesh) mesh.castShadow = true;

  // Hair and beards are static meshes in the body's rest space: hung on the head bone.
  const hairIds: HairId[] = [];
  const hairId = hairFor(look, female);
  if (hairId) hairIds.push(hairId);
  if (!female && (look.gear ?? []).some((g) => g === 'stubble' || g === 'mustache')) hairIds.push('beard');
  const head = bones.get('Head');
  if (head) {
    const toHead = rest('Head').invert();
    for (const id of hairIds) {
      const hair = lib.hair[id].clone(true);
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(toHead);
      hair.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.userData = {};
        mesh.castShadow = true;
        const tinted = (mesh.material as THREE.MeshStandardMaterial).clone();
        tinted.color.set(look.hair).multiplyScalar(2.2);
        mesh.material = tinted;
        owned.push(tinted);
      });
      holder.add(hair);
      head.add(holder);
    }
  }

  // ── Animation ──
  const mixer = new THREE.AnimationMixer(body);
  let current: ClipChoice | null = null;
  let baseAction: THREE.AnimationAction | null = null;
  let upperAction: THREE.AnimationAction | null = null;
  const actionFor = (name: ClipName, layer: 'full' | 'lower' | 'upper') => {
    const clip = lib[layer].get(name) ?? lib.full.get('Idle')!;
    return mixer.clipAction(clip);
  };
  const swap = (from: THREE.AnimationAction | null, to: THREE.AnimationAction | null, once = false) => {
    if (to === from) return;
    if (to) {
      to.reset();
      to.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      to.clampWhenFinished = once;
      to.play();
      if (from) to.crossFadeFrom(from, FADE, false);
      else to.fadeIn(FADE);
    } else if (from) from.fadeOut(FADE);
  };

  // Body layout offsets for poses without a clip of their own (eased like the clips).
  const layout = { forward: 0, y: 0, pitch: 0 };
  const target = { forward: 0, y: 0, pitch: 0 };
  const phase = Math.random() * 10;

  return {
    root,
    lanternLight: lantern,
    update(pose: FigurePose, dt: number, _time: number, speed: number) {
      const choice = clipsFor(pose, Boolean(look.lantern));
      if (!current || choice.base !== current.base || choice.upper !== current.upper || choice.once !== current.once) {
        const nextBase = actionFor(choice.base, choice.upper ? 'lower' : 'full');
        const nextUpper = choice.upper ? actionFor(choice.upper, 'upper') : null;
        if (!current) {
          // First pose: start at a random point of the cycle so a squad never moves in step.
          nextBase.time = phase % (nextBase.getClip().duration || 1);
        }
        swap(baseAction, nextBase, choice.once);
        swap(upperAction, nextUpper);
        baseAction = nextBase;
        upperAction = nextUpper;
        current = choice;
      }
      if (baseAction && LOCOMOTION.has(choice.base)) {
        const native = lib.speeds[choice.base] ?? 1;
        // Feet keep pace with the ground; a stopped-but-moving unit still shuffles.
        const rate = choice.layout === 'prone' ? 0.55 : speed > 0.05 ? speed / (native * (look.height ?? 1)) : 0.8;
        baseAction.timeScale = THREE.MathUtils.clamp(rate, 0.5, 1.8);
      } else if (baseAction) baseAction.timeScale = 1;

      target.forward = 0;
      target.y = 0;
      target.pitch = 0;
      if (choice.layout === 'prone') {
        // Face down with the hips over the unit's position (as the procedural figure lies).
        target.forward = -0.92 * (look.height ?? 1);
        target.y = 0.13;
        target.pitch = Math.PI / 2;
      } else if (choice.layout === 'carried') {
        // Fallen pose, lifted onto the carrier's shoulder.
        target.y = 1.2;
      } else if (pose.swimming) target.y = -0.55;
      const blend = Math.min(1, dt * 8);
      layout.forward += (target.forward - layout.forward) * blend;
      layout.y += (target.y - layout.y) * blend;
      layout.pitch += (target.pitch - layout.pitch) * blend;
      inner.position.set(layout.forward, layout.y, 0);
      inner.rotation.x = layout.pitch;

      if (skirt) {
        // The coat skirt shortens over bent legs.
        const bent = pose.stance === 'crouch' || pose.stance === 'prone' || choice.layout !== 'upright';
        skirt.scale.y += ((bent ? 0.55 : 1) - skirt.scale.y) * blend;
      }
      if (weapon) {
        // Slung on the back, or shouldered when aiming (same placement as the procedural figure).
        const aimed = choice.upper === 'Aim';
        weapon.position.set(aimed ? 0.26 : -0.15, aimed ? 0.41 : 0.27, aimed ? 0.11 : 0.02);
        weapon.rotation.set(0, 0, aimed ? 0 : 1.2);
      }
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(body);
      for (const m of owned) m.dispose();
    },
  };
}
