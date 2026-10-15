'use client';

import type { Vec2 } from '@operation-shadow/engine';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getBindings, isBound } from '../input/bindings';
import type { GameController } from '../runtime/controller';
import { useGameUi } from '../runtime/store';

const DEFAULT_PITCH = 0.93;
const DEFAULT_DISTANCE = 40;
const MIN_DISTANCE = 14;
const MAX_DISTANCE = 95;

let shake = 0;
/** Requests a brief camera shake (scaled down by the reduced-shake setting). */
export function requestShake(amount: number): void {
  shake = Math.min(1.5, shake + amount);
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
function openingView(controller: GameController): { yaw: number; target: Vec2 } {
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

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey) return;
      const b = getBindings();
      if ([...b['pan-up'], ...b['pan-down'], ...b['pan-left'], ...b['pan-right']].includes(e.code)) keys.current.add(e.code);
      if (isBound('rotate-left', e.code)) rig.current.desiredYaw -= Math.PI / 4;
      if (isBound('rotate-right', e.code)) rig.current.desiredYaw += Math.PI / 4;
      if (isBound('camera-reset', e.code)) {
        // Keep the yaw within one turn of the current heading so the reset never spins around.
        const r = rig.current;
        r.desiredYaw = opening.yaw + Math.round((r.desiredYaw - opening.yaw) / (Math.PI * 2)) * Math.PI * 2;
        r.pitch = DEFAULT_PITCH;
        r.desiredDistance = DEFAULT_DISTANCE;
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const element = gl.domElement;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rig.current;
      r.desiredDistance = THREE.MathUtils.clamp(r.desiredDistance * (1 + Math.sign(e.deltaY) * 0.12), MIN_DISTANCE, MAX_DISTANCE);
    };
    const pointerDown = (e: PointerEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        drag.current = { x: e.clientX, y: e.clientY };
      }
    };
    const pointerMove = (e: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointer.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, inside: true };
      if (drag.current) {
        const r = rig.current;
        r.desiredYaw -= (e.clientX - drag.current.x) * 0.006;
        r.pitch = THREE.MathUtils.clamp(r.pitch + (e.clientY - drag.current.y) * 0.004, 0.55, 1.3);
        drag.current = { x: e.clientX, y: e.clientY };
      }
    };
    const pointerUp = (e: PointerEvent) => {
      if (e.button === 1) drag.current = null;
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
    const ui = useGameUi.getState();
    if (requestedView) {
      const v = requestedView;
      requestedView = null;
      r.target.set(v.x, v.z);
      r.desiredTarget.set(v.x, v.z);
      r.yaw = r.desiredYaw = v.yaw;
      r.distance = r.desiredDistance = THREE.MathUtils.clamp(v.distance, MIN_DISTANCE, MAX_DISTANCE);
    }
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

    const grid = controller.world.grid;
    const ground = grid.heightAt({ x: r.target.x, z: r.target.y });
    const horizontal = Math.cos(r.pitch) * r.distance;
    let cx = r.target.x + Math.sin(r.yaw) * horizontal;
    let cz = r.target.y + Math.cos(r.yaw) * horizontal;
    let cy = ground + Math.sin(r.pitch) * r.distance;
    const clearance = grid.heightAt({ x: cx, z: cz }) + 3;
    if (cy < clearance) cy = clearance;
    if (shake > 0.001) {
      const amount = shake * (reducedShake ? 0.2 : 1);
      cx += (Math.random() - 0.5) * amount;
      cy += (Math.random() - 0.5) * amount * 0.5;
      cz += (Math.random() - 0.5) * amount;
      shake *= Math.exp(-dt * 7);
    }
    camera.position.set(cx, cy, cz);
    camera.lookAt(r.target.x, ground + 1, r.target.y);
    currentView = { x: r.desiredTarget.x, z: r.desiredTarget.y, distance: r.desiredDistance, yaw: r.desiredYaw };
  });

  return null;
}
