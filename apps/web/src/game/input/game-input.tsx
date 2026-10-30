'use client';

import { ABILITY_INFO } from '@operation-shadow/content';
import { ABILITIES, type Command, type Stance, type Vec2 } from '@operation-shadow/engine';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { activeAudio } from '../audio/registry';
import { focusOn } from '../camera/camera-rig';
import type { GameController } from '../runtime/controller';
import { closeMenu, openMenu } from '../runtime/menus';
import { getActivePersistence } from '../runtime/persistence';
import { openRecall } from '../runtime/recall-session';
import { useSettings } from '../runtime/settings';
import { useGameUi } from '../runtime/store';
import { actionForCode, SELECT_ACTIONS, SLOT_ACTIONS } from './bindings';
import { abilityBar, type ContextAction, type PointerTarget, resolveAbilityOrder, resolveContextAction } from './context-action';
import { pickEntity, pickGround, toScreen } from './picking';

const DRAG_THRESHOLD = 6;
const DOUBLE_CLICK_MS = 350;
const HINT_INTERVAL_MS = 180;
const SPEEDS = [0.5, 1, 1.5, 2];

const sameTarget = (a: PointerTarget, b: PointerTarget) => a?.id === b?.id && a?.kind === b?.kind;

interface Press {
  x: number;
  y: number;
  shift: boolean;
  dragging: boolean;
}

/**
 * Mouse and keyboard handling for a mission: per-frame picking (ground and entities), selection
 * (click, Shift, drag box, number keys), right-click context orders, ability targeting and hotkeys.
 */
export function GameInput({ controller }: { controller: GameController }) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const pointer = useRef({ x: 0, y: 0, inside: false });
  const press = useRef<Press | null>(null);
  const lastRight = useRef({ t: 0, x: 0, y: 0 });
  const lastLeft = useRef({ t: 0, id: '' });
  /** The last walk-up ability order from the targeting cursor: clicking it again quickly upgrades it to a run. */
  const lastAbilityOrder = useRef<{ t: number; x: number; y: number; command: Extract<Command, { type: 'ability' }> } | null>(null);
  const lastSelectKey = useRef({ t: 0, index: -1 });
  const hintAt = useRef({ t: 0, key: '' });
  const cursor = useRef('default');

  useEffect(() => {
    const element = gl.domElement;
    const ui = () => useGameUi.getState();
    const world = () => controller.world;
    const running = () => controller.world.state.status === 'running';

    const rectOf = () => element.getBoundingClientRect();
    const aim = (clientX: number, clientY: number) => {
      const rect = rectOf();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, get().camera);
    };
    const pickAt = (clientX: number, clientY: number): { entity: PointerTarget; ground: Vec2 | null } => {
      aim(clientX, clientY);
      return { entity: pickEntity(raycaster, get().scene), ground: pickGround(world(), raycaster.ray) };
    };

    const issue = (command: Command, marker?: { pos: Vec2; kind: 'move' | 'run' | 'action' }) => {
      const result = controller.command(command);
      if (!result.ok) {
        activeAudio()?.uiDeny();
        ui().toast(result.message);
        if (marker) ui().markOrder(marker.pos, 'blocked');
        return false;
      }
      if (marker) ui().markOrder(marker.pos, marker.kind);
      return true;
    };

    const execute = (action: ContextAction, ground: Vec2 | null) => {
      if (action.kind === 'move') issue(action.command, { pos: action.command.target, kind: action.command.gait === 'run' ? 'run' : 'move' });
      else if (action.kind === 'ability') {
        const pos = world().resolveTargetPos(action.command.target) ?? ground;
        issue(action.command, pos ? { pos, kind: 'action' } : undefined);
      } else if (action.kind === 'blocked') {
        activeAudio()?.uiDeny();
        ui().toast(action.message);
      }
    };

    const activeSelected = () => ui().selected.filter((id) => world().operative(id)?.status === 'active');

    // ── Pointer ──────────────────────────────────────────────────────────────────────────
    const onPointerMove = (e: PointerEvent) => {
      const rect = rectOf();
      pointer.current = { x: e.clientX, y: e.clientY, inside: true };
      const p = press.current;
      if (p && (e.buttons & 1) === 1) {
        if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD) p.dragging = true;
        if (p.dragging) ui().setDragBox({ x0: p.x - rect.left, y0: p.y - rect.top, x1: e.clientX - rect.left, y1: e.clientY - rect.top });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, inside: true };
      // Alt/Option + left drag turns the camera (camera rig), so it neither selects nor targets.
      if (e.button === 0 && e.altKey) return;
      if (e.button === 0) {
        const state = ui();
        const last = lastAbilityOrder.current;
        lastAbilityOrder.current = null;
        if (last && running() && performance.now() - last.t < DOUBLE_CLICK_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 12) {
          // Double-click on a target: run there instead (a knife rush, a sprint to a downed ally).
          const command = { ...last.command, gait: 'run' as const };
          const pos = world().resolveTargetPos(command.target);
          issue(command, pos ? { pos, kind: 'run' } : undefined);
          return;
        }
        if (state.targeting && running()) {
          const lead = activeSelected()[0];
          const { entity, ground } = pickAt(e.clientX, e.clientY);
          if (!lead) {
            state.setTargeting(null);
            return;
          }
          const { command, result } = resolveAbilityOrder(world(), lead, state.targeting, entity, ground, { queue: e.shiftKey });
          if (!command || !result.ok) {
            state.toast(result.ok ? 'Choose a target' : result.message);
            return;
          }
          const pos = world().resolveTargetPos(command.target) ?? ground;
          if (issue(command, pos ? { pos, kind: 'action' } : undefined)) {
            state.setTargeting(null);
            if (ABILITIES[command.abilityId].approach && !command.queue) lastAbilityOrder.current = { t: performance.now(), x: e.clientX, y: e.clientY, command };
          }
          return;
        }
        press.current = { x: e.clientX, y: e.clientY, shift: e.shiftKey, dragging: false };
        return;
      }
      if (e.button === 2) {
        e.preventDefault();
        const state = ui();
        if (state.targeting) {
          state.setTargeting(null);
          return;
        }
        if (!running()) return;
        const now = performance.now();
        const double = now - lastRight.current.t < DOUBLE_CLICK_MS && Math.hypot(e.clientX - lastRight.current.x, e.clientY - lastRight.current.y) < 12;
        lastRight.current = { t: double ? 0 : now, x: e.clientX, y: e.clientY };
        const { entity, ground } = pickAt(e.clientX, e.clientY);
        const action = resolveContextAction(world(), state.selected, entity, ground, { gait: double ? 'run' : 'walk', queue: e.shiftKey });
        execute(action, ground);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = press.current;
      press.current = null;
      if (!p) return;
      const state = ui();
      if (p.dragging) {
        const box = state.dragBox;
        state.setDragBox(null);
        if (!box) return;
        const rect = rectOf();
        const camera = get().camera;
        const [minX, maxX] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)];
        const [minY, maxY] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
        const inside = world()
          .state.operatives.filter((op) => op.status === 'active' || op.status === 'downed')
          .filter((op) => {
            const pos = controller.interpolate(op.id, op.pos);
            const s = toScreen(camera, rect, pos.x, world().grid.heightAt(pos) + 0.9, pos.z);
            return s.visible && s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY;
          })
          .map((op) => op.id);
        if (inside.length === 0) return;
        state.select(p.shift ? [...new Set([...state.selected, ...inside])] : inside);
        return;
      }
      const { entity } = pickAt(e.clientX, e.clientY);
      if (entity?.kind === 'operative') {
        const op = world().operative(entity.id);
        if (!op || op.status === 'extracted' || op.status === 'dead') return;
        const now = performance.now();
        if (now - lastLeft.current.t < DOUBLE_CLICK_MS && lastLeft.current.id === entity.id) {
          state.select([entity.id]);
          focusOn(op.pos);
        } else state.select([entity.id], p.shift);
        lastLeft.current = { t: now, id: entity.id };
      } else if (entity?.kind === 'guard') {
        state.toggleCone(entity.id);
      }
    };

    const onLeave = () => {
      pointer.current.inside = false;
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    // ── Keyboard ─────────────────────────────────────────────────────────────────────────
    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

    const selectIndex = (index: number, additive: boolean) => {
      const op = world().state.operatives[index];
      if (!op || op.status === 'extracted' || op.status === 'dead') return;
      const now = performance.now();
      if (lastSelectKey.current.index === index && now - lastSelectKey.current.t < DOUBLE_CLICK_MS) focusOn(op.pos);
      lastSelectKey.current = { t: now, index };
      ui().select([op.id], additive);
    };

    const stance = (value: Stance) => {
      const ids = activeSelected();
      if (ids.length > 0) issue({ type: 'stance', unitIds: ids, stance: value });
    };

    const activateSlot = (index: number) => {
      const leadId = activeSelected()[0];
      const lead = leadId ? world().operative(leadId) : undefined;
      if (!lead) {
        ui().toast('Select a squad member first', 'info');
        return;
      }
      const abilityId = abilityBar(lead)[index];
      if (!abilityId) return;
      if (ABILITIES[abilityId].target === 'self') {
        issue({ type: 'ability', unitId: lead.id, abilityId, target: { kind: 'self' } }, { pos: lead.pos, kind: 'action' });
        return;
      }
      const state = ui();
      state.setTargeting(state.targeting === abilityId ? null : abilityId);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const state = ui();
      if (e.code === 'Escape') {
        if (state.targeting) state.setTargeting(null);
        else if (state.menu !== 'none') closeMenu(controller);
        else if (running()) openMenu(controller, 'pause');
        return;
      }
      const action = actionForCode(e.code);
      if (state.menu !== 'none') {
        if (action === 'help') {
          e.preventDefault();
          if (state.menu === 'help') closeMenu(controller);
          else openMenu(controller, 'help');
        }
        return;
      }
      if (e.key === 'Alt') {
        e.preventDefault();
        state.setShowAllCones(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
        e.preventDefault();
        state.select(world().state.operatives.filter((op) => op.status === 'active').map((op) => op.id));
        return;
      }
      if (e.ctrlKey || e.metaKey || !action) return;
      if (e.repeat && action !== 'cycle') return;

      const selectIdx = (SELECT_ACTIONS as readonly string[]).indexOf(action);
      if (selectIdx >= 0) {
        selectIndex(selectIdx, e.shiftKey);
        return;
      }
      const slotIdx = (SLOT_ACTIONS as readonly string[]).indexOf(action);
      if (slotIdx >= 0) {
        if (running()) activateSlot(slotIdx);
        return;
      }
      switch (action) {
        case 'pause':
          e.preventDefault();
          if (running()) controller.setPaused(!controller.paused);
          break;
        case 'stand':
          stance('stand');
          break;
        case 'crouch':
          stance('crouch');
          break;
        case 'prone':
          stance('prone');
          break;
        case 'stop': {
          const ids = activeSelected();
          if (ids.length > 0) issue({ type: 'stop', unitIds: ids });
          break;
        }
        case 'cycle': {
          e.preventDefault();
          const ops = world().state.operatives.filter((op) => op.status === 'active');
          if (ops.length === 0) break;
          const current = ops.findIndex((op) => op.id === state.selected[0]);
          const next = ops[(current + 1) % ops.length]!;
          state.select([next.id]);
          focusOn(next.pos);
          break;
        }
        case 'speed-down':
        case 'speed-up': {
          const i = SPEEDS.indexOf(controller.speed);
          const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 1 : i) + (action === 'speed-up' ? 1 : -1)))]!;
          controller.speed = next;
          controller.notifyHud();
          state.toast(`Game speed ×${next}`, 'info');
          break;
        }
        case 'track':
          if (state.selected.length > 0) state.setTracking(!state.tracking);
          break;
        case 'help':
          e.preventDefault();
          openMenu(controller, 'help');
          break;
        case 'hold': {
          const ids = activeSelected();
          if (ids.length > 0 && running()) {
            issue({ type: 'hold', unitIds: ids, queue: e.shiftKey });
            state.toast(e.shiftKey ? 'Will wait for the signal after current orders' : 'Waiting for the signal', 'info');
          }
          break;
        }
        case 'signal':
          e.preventDefault();
          if (running()) issue({ type: 'signal' });
          break;
        case 'quicksave':
          e.preventDefault();
          if (running()) void getActivePersistence()?.save('quick');
          break;
        case 'quickload':
          e.preventDefault();
          void getActivePersistence()?.load('quick');
          break;
        case 'recall':
          e.preventDefault();
          openRecall(controller);
          break;
        case 'perf': {
          e.preventDefault();
          const settings = useSettings.getState();
          settings.update({ showFps: !settings.showFps });
          break;
        }
        default:
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') useGameUi.getState().setShowAllCones(false);
    };
    const onBlur = () => {
      useGameUi.getState().setShowAllCones(false);
      press.current = null;
      useGameUi.getState().setDragBox(null);
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerleave', onLeave);
    element.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [controller, gl, get, ndc, raycaster]);

  // Per-frame picking: hover and ground follow the cursor even while the camera or units move.
  useFrame((state) => {
    const ui = useGameUi.getState();
    const world = controller.world;
    const p = pointer.current;
    let hovered: PointerTarget = null;
    let ground: Vec2 | null = null;
    if (p.inside && !press.current?.dragging) {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, state.camera);
      hovered = pickEntity(raycaster, state.scene);
      ground = pickGround(world, raycaster.ray);
    }
    if (!sameTarget(hovered, ui.hovered)) ui.setHovered(hovered);
    const g = ui.groundPoint;
    if ((g === null) !== (ground === null) || (g && ground && (Math.abs(g.x - ground.x) > 0.05 || Math.abs(g.z - ground.z) > 0.05))) ui.setGroundPoint(ground);

    // Context hint for the HUD and the cursor, refreshed a few times a second.
    const now = performance.now();
    const key = `${ui.targeting ?? ''}|${hovered?.id ?? ''}|${ui.selected.join(',')}|${ui.targeting && ground ? `${Math.round(ground.x)},${Math.round(ground.z)}` : ''}`;
    if (key !== hintAt.current.key || now - hintAt.current.t > HINT_INTERVAL_MS) {
      hintAt.current = { t: now, key };
      if (world.state.status !== 'running') ui.setContextHint(null);
      else if (ui.targeting) {
        const lead = ui.selected.find((id) => world.operative(id)?.status === 'active');
        const name = ABILITY_INFO[ui.targeting].name;
        if (!lead) ui.setContextHint({ label: name, ok: false, message: 'Select a squad member' });
        else {
          const { command, result } = resolveAbilityOrder(world, lead, ui.targeting, hovered, ground);
          ui.setContextHint(command ? { label: name, ok: result.ok, message: result.ok ? undefined : result.message } : { label: name, ok: false, message: 'Choose a target' });
        }
      } else if (hovered) {
        const action = resolveContextAction(world, ui.selected, hovered, ground);
        if (action.kind === 'ability' || action.kind === 'move') ui.setContextHint({ label: action.label, ok: true });
        else if (action.kind === 'blocked') ui.setContextHint({ label: action.label, ok: false, message: action.message });
        else ui.setContextHint(null);
      } else ui.setContextHint(null);
    }

    const hint = ui.contextHint;
    const next = ui.targeting ? (hint?.ok ? 'crosshair' : 'not-allowed') : hovered && hint ? (hint.ok ? 'pointer' : 'not-allowed') : 'default';
    if (next !== cursor.current) {
      cursor.current = next;
      gl.domElement.style.cursor = next;
    }
  });

  return <OrderMarkerRing controller={controller} />;
}

const MARKER_COLORS = { move: '#f2efe6', run: '#e7c35a', action: '#8fd18a', blocked: '#ff5a3c' } as const;

/** Brief expanding ring where an order was given (red when refused). */
function OrderMarkerRing({ controller }: { controller: GameController }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const marker = useGameUi.getState().orderMarker;
    const t = marker ? (performance.now() - marker.at) / 550 : 1;
    m.visible = Boolean(marker) && t < 1;
    if (!marker || t >= 1) return;
    const r = 0.25 + t * 0.6;
    m.scale.set(r, 1, r);
    m.position.set(marker.pos.x, controller.world.grid.heightAt(marker.pos) + 0.12, marker.pos.z);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.set(MARKER_COLORS[marker.kind]);
    mat.opacity = 1 - t;
  });
  return (
    <mesh ref={mesh} geometry={geometry} renderOrder={5} visible={false}>
      <meshBasicMaterial transparent depthWrite={false} />
    </mesh>
  );
}
