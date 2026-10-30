'use client';

import type { Vec2 } from '@operation-shadow/engine';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getBindings, isBound } from '../input/bindings';
import type { GameController } from '../runtime/controller';
import { useSettings } from '../runtime/settings';
import { useGameUi } from '../runtime/store';
import { type CameraPose, reelPose } from './cinematic';

const DEFAULT_PITCH = 0.93;
const DEFAULT_DISTANCE = 40;
const MIN_DISTANCE = 14;
/** Far enough to see a whole 160 × 120 m map. */
const MAX_DISTANCE = 190;
const MIN_PITCH = 0.35;
const MAX_PITCH = 1.48;
/** Spin rate while a rotate key is held (radians per second). */
const SPIN_RATE = 1.9;
/** How long a rotate key must be held before it spins instead of stepping 45°. */
const SPIN_DELAY = 0.3;

let shake = 0;
/** Requests a brief camera shake (scaled down by the reduced-shake setting). */
export function requestShake(amount: number): void {
  shake = Math.min(1.5, shake + amount);
}

let pendingYaw = 0;
let pendingReset = false;
/** Turns the camera about its focus (on-screen buttons); radians, positive turns right. */
export function rotateCamera(delta: number): void {
  pendingYaw += delta;
}
/** Back to the opening angle, tilt and zoom (on-screen button). */
export function resetCamera(): void {
  pendingReset = true;
}

/** Pans the camera to a point (portraits, minimap, double-click). */
export function focusOn(pos: Vec2): void {
  useGameUi.getState().focusCamera(pos);
}

/** Where the camera looks, for saves; and a view to restore on load. */
export interface CameraView {
  x: number;
  z: number;
  distance: number;
  yaw: number;
}
let currentView: CameraView | null = null;
let requestedView: CameraView | null = null;
export const getCameraView = (): CameraView | null => (currentView ? { ...currentView } : null);
export function setCameraView(view: CameraView | null): void {
  requestedView = view ? { ...view } : null;
}

let livePose: CameraPose | null = null;
/** What the camera shows right now (the look point, not the pan target), for the closing shot. */
export const getCameraPose = (): CameraPose | null => (livePose ? { ...livePose } : null);

const focusPoint = new THREE.Vector3();
const forward = new THREE.Vector3();
/** Ground point the camera looks at (used by lighting and effects to stay near the action). */
export function cameraFocus(camera: THREE.Camera): THREE.Vector3 {
  camera.getWorldDirection(forward);
  const t = forward.y < -0.05 ? (camera.position.y - 2) / -forward.y : 40;
  return focusPoint.copy(camera.position).addScaledVector(forward, t);
}

/**
 * Opening view: a classic diagonal (isometric) angle that looks from the insertion point toward
 * the primary objective, so the mission area fills the screen instead of the map edge.
 */
export function openingView(controller: GameController): { yaw: number; target: Vec2 } {
  const spawn = controller.mission.squadSpawns[0]?.pos ?? { x: controller.level.width / 2, z: controller.level.depth / 2 };
  const primary = controller.mission.objectives.find((o) => o.required);
  const objectId = primary?.kind === 'disable-target' ? primary.targetId : primary?.kind === 'acquire-item' ? primary.itemObjectId : primary?.kind === 'rescue' ? primary.prisonerId : null;
  const goal = (objectId ? controller.world.object(objectId)?.pos : undefined) ?? { x: controller.level.width / 2, z: controller.level.depth / 2 };
  // The camera sits opposite the direction it looks in: offset = (sin yaw, cos yaw).
  const raw = Math.atan2(spawn.x - goal.x, spawn.z - goal.z);
  const yaw = Math.round((raw - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
  const look = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  return { yaw, target: { x: spawn.x + look.x * 9, z: spawn.z + look.z * 9 } };
}

/** The opening view as a full pose: where the insertion reel ends and play begins. */
export function openingPose(controller: GameController): CameraPose {
  const { yaw, target } = openingView(controller);
  return { x: target.x, z: target.z, yaw, pitch: DEFAULT_PITCH, distance: DEFAULT_DISTANCE };
}

/** Places the camera for a pose: behind and above the look point, never under the terrain. */
function placeCamera(camera: THREE.Camera, controller: GameController, pose: CameraPose, jitter = 0): void {
  const grid = controller.world.grid;
  const ground = grid.heightAt({ x: pose.x, z: pose.z });
  const horizontal = Math.cos(pose.pitch) * pose.distance;
  let cx = pose.x + Math.sin(pose.yaw) * horizontal;
  let cz = pose.z + Math.cos(pose.yaw) * horizontal;
  let cy = ground + Math.sin(pose.pitch) * pose.distance;
  const clearance = grid.heightAt({ x: cx, z: cz }) + 3;
  if (cy < clearance) cy = clearance;
  if (jitter > 0) {
    cx += (Math.random() - 0.5) * jitter;
    cy += (Math.random() - 0.5) * jitter * 0.5;
    cz += (Math.random() - 0.5) * jitter;
  }
  camera.position.set(cx, cy, cz);
  camera.lookAt(pose.x, ground + 1, pose.z);
  // The near plane follows the zoom: nothing comes close to a camera this high, and pushing it
  // out keeps depth precision (shadows, ambient occlusion) across the much longer zoomed-out view.
  const near = THREE.MathUtils.clamp(pose.distance * 0.08, 0.5, 15);
  if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.near - near) > camera.near * 0.02) {
    camera.near = near;
    camera.updateProjectionMatrix();
  }
  livePose = { ...pose };
}

interface RigState {
  target: THREE.Vector2;
  desiredTarget: THREE.Vector2;
  yaw: number;
  desiredYaw: number;
  pitch: number;
  distance: number;
  desiredDistance: number;
}

export interface CameraRigProps {
  controller: GameController;
  edgeScroll?: boolean;
  reducedShake?: boolean;
}

export function CameraRig({ controller, edgeScroll = false, reducedShake = false }: CameraRigProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const keys = useRef(new Set<string>());
  const pointer = useRef({ x: 0.5, y: 0.5, inside: false });
  const opening = useMemo(() => openingView(controller), [controller]);
  const rig = useRef<RigState>({
    target: new THREE.Vector2(opening.target.x, opening.target.z),
    desiredTarget: new THREE.Vector2(opening.target.x, opening.target.z),
    yaw: opening.yaw,
    desiredYaw: opening.yaw,
    pitch: DEFAULT_PITCH,
    distance: DEFAULT_DISTANCE,
    desiredDistance: DEFAULT_DISTANCE,
  });
  const drag = useRef<{ x: number; y: number } | null>(null);
  /** When each held rotate key went down (seconds, performance clock), for hold-to-spin. */
  const spin = useRef<{ left: number | null; right: number | null }>({ left: null, right: null });

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey) return;
      const b = getBindings();
      if ([...b['pan-up'], ...b['pan-down'], ...b['pan-left'], ...b['pan-right']].includes(e.code)) keys.current.add(e.code);
      // A tap turns 45°; holding the key keeps spinning (see the frame loop).
      if (isBound('rotate-left', e.code) && !e.repeat) {
        rig.current.desiredYaw -= Math.PI / 4;
        spin.current.left = performance.now() / 1000;
      }
      if (isBound('rotate-right', e.code) && !e.repeat) {
        rig.current.desiredYaw += Math.PI / 4;
        spin.current.right = performance.now() / 1000;
      }
      if (isBound('camera-reset', e.code)) pendingReset = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      if (isBound('rotate-left', e.code)) spin.current.left = null;
      if (isBound('rotate-right', e.code)) spin.current.right = null;
    };
    const blur = () => {
      keys.current.clear();
      spin.current = { left: null, right: null };
    };
    const element = gl.domElement;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rig.current;
      // A sideways trackpad swipe turns the camera; vertical scrolling (and pinch) zooms.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) {
        r.desiredYaw += e.deltaX * 0.004 * useSettings.getState().mouseSensitivity;
        return;
      }
      if (e.deltaY === 0) return;
      const step = e.ctrlKey ? Math.min(0.12, Math.abs(e.deltaY) * 0.01) : 0.12;
      r.desiredDistance = THREE.MathUtils.clamp(r.desiredDistance * (1 + Math.sign(e.deltaY) * step), MIN_DISTANCE, MAX_DISTANCE);
    };
    const pointerDown = (e: PointerEvent) => {
      // Middle drag, or Alt/Option + left drag (trackpads), turns and tilts the camera.
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        drag.current = { x: e.clientX, y: e.clientY };
      }
    };
    const pointerMove = (e: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointer.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, inside: true };
      if (drag.current) {
        const r = rig.current;
        const sensitivity = useSettings.getState().mouseSensitivity;
        r.desiredYaw -= (e.clientX - drag.current.x) * 0.006 * sensitivity;
        r.pitch = THREE.MathUtils.clamp(r.pitch + (e.clientY - drag.current.y) * 0.004 * sensitivity, MIN_PITCH, MAX_PITCH);
        drag.current = { x: e.clientX, y: e.clientY };
      }
    };
    const pointerUp = (e: PointerEvent) => {
      if (e.button === 1 || e.button === 0) drag.current = null;
    };
    const leave = () => {
      pointer.current.inside = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    element.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      element.removeEventListener('pointerleave', leave);
    };
  }, [gl, opening]);

  // Focus requests (portrait double-click, minimap clicks).
  const focus = useGameUi((s) => s.cameraFocus);
  useEffect(() => {
    if (focus) rig.current.desiredTarget.set(focus.pos.x, focus.pos.z);
  }, [focus]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const r = rig.current;
    // A cinematic reel (mission opening or closing) holds the camera; the rig waits where it was.
    const scripted = reelPose(performance.now());
    if (scripted) {
      placeCamera(camera, controller, scripted);
      return;
    }
    const ui = useGameUi.getState();
    if (requestedView) {
      const v = requestedView;
      requestedView = null;
      r.target.set(v.x, v.z);
      r.desiredTarget.set(v.x, v.z);
      r.yaw = r.desiredYaw = v.yaw;
      r.distance = r.desiredDistance = THREE.MathUtils.clamp(v.distance, MIN_DISTANCE, MAX_DISTANCE);
    }
    if (pendingYaw !== 0) {
      r.desiredYaw += pendingYaw;
      pendingYaw = 0;
    }
    if (pendingReset) {
      pendingReset = false;
      // Keep the yaw within one turn of the current heading so the reset never spins around.
      r.desiredYaw = opening.yaw + Math.round((r.desiredYaw - opening.yaw) / (Math.PI * 2)) * Math.PI * 2;
      r.pitch = DEFAULT_PITCH;
      r.desiredDistance = DEFAULT_DISTANCE;
    }
    const now = performance.now() / 1000;
    if (spin.current.left !== null && now - spin.current.left > SPIN_DELAY) r.desiredYaw -= SPIN_RATE * dt;
    if (spin.current.right !== null && now - spin.current.right > SPIN_DELAY) r.desiredYaw += SPIN_RATE * dt;
    const fx = -Math.sin(r.yaw);
    const fz = -Math.cos(r.yaw);
    const rx = Math.cos(r.yaw);
    const rz = -Math.sin(r.yaw);
    const speed = (14 + r.distance * 0.9) * dt;
    let px = 0;
    let pz = 0;
    const k = keys.current;
    const b = getBindings();
    const held = (codes: string[]) => codes.some((code) => k.has(code));
    if (held(b['pan-up'])) pz += 1;
    if (held(b['pan-down'])) pz -= 1;
    if (held(b['pan-right'])) px += 1;
    if (held(b['pan-left'])) px -= 1;
    if (edgeScroll && pointer.current.inside) {
      const edge = 0.02;
      if (pointer.current.x < edge) px -= 1;
      if (pointer.current.x > 1 - edge) px += 1;
      if (pointer.current.y < edge) pz += 1;
      if (pointer.current.y > 1 - edge) pz -= 1;
    }
    if (px !== 0 || pz !== 0) {
      r.desiredTarget.x += (fx * pz + rx * px) * speed;
      r.desiredTarget.y += (fz * pz + rz * px) * speed;
      if (ui.tracking) ui.setTracking(false);
    }
    if (ui.tracking && ui.selected[0]) {
      const op = controller.world.operative(ui.selected[0]);
      if (op) {
        const p: Vec2 = controller.interpolate(op.id, op.pos);
        r.desiredTarget.set(p.x, p.z);
      }
    }
    const { width, depth } = controller.level;
    r.desiredTarget.x = THREE.MathUtils.clamp(r.desiredTarget.x, 4, width - 4);
    r.desiredTarget.y = THREE.MathUtils.clamp(r.desiredTarget.y, 4, depth - 4);

    const smooth = 1 - Math.exp(-dt * 9);
    r.target.lerp(r.desiredTarget, smooth);
    r.yaw += (r.desiredYaw - r.yaw) * smooth;
    r.distance += (r.desiredDistance - r.distance) * smooth;

    // Zoomed far out, the view drifts to the middle of the map so the whole map is framed
    // (otherwise a squad at the map edge leaves half the screen looking at empty sky).
    const overview = THREE.MathUtils.smoothstep(r.distance, DEFAULT_DISTANCE * 1.5, MAX_DISTANCE);
    const lookX = THREE.MathUtils.lerp(r.target.x, width / 2, overview);
    const lookZ = THREE.MathUtils.lerp(r.target.y, depth / 2, overview);
    let jitter = 0;
    if (shake > 0.001) {
      jitter = shake * (reducedShake ? 0.2 : 1);
      shake *= Math.exp(-dt * 7);
    }
    placeCamera(camera, controller, { x: lookX, z: lookZ, yaw: r.yaw, pitch: r.pitch, distance: r.distance }, jitter);
    currentView = { x: r.desiredTarget.x, z: r.desiredTarget.y, distance: r.desiredDistance, yaw: r.desiredYaw };
  });

  return null;
}
