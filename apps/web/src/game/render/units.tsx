'use client';

import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { CellFlag, type Guard, type Vec2 } from '@operation-shadow/engine';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import type { GameController } from '../runtime/controller';
import { type HoverTarget, useGameUi } from '../runtime/store';
import { createFigure, type FigurePose, type FigureRig, poseFigure } from './figure';
import { DISGUISED_LOOK, guardLook, PRISONER_LOOK, SQUAD_LOOKS } from './looks';

type IconKind = 'eye' | 'question' | 'alert' | 'talk' | 'sleep';

const iconCache = new Map<IconKind, THREE.SpriteMaterial>();

function iconMaterial(kind: IconKind): THREE.SpriteMaterial {
  const cached = iconCache.get(kind);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const colors: Record<IconKind, string> = { eye: '#e9d47c', question: '#f0a23a', alert: '#ff5a3c', talk: '#c9d1d6', sleep: '#9fb4c9' };
  const color = colors[kind];
  ctx.fillStyle = 'rgba(12,16,20,0.82)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  // Distinct outline shapes so state never relies on colour alone.
  if (kind === 'alert') {
    ctx.moveTo(64, 10);
    ctx.lineTo(118, 112);
    ctx.lineTo(10, 112);
    ctx.closePath();
  } else if (kind === 'question') {
    ctx.moveTo(64, 8);
    ctx.lineTo(120, 64);
    ctx.lineTo(64, 120);
    ctx.lineTo(8, 64);
    ctx.closePath();
  } else {
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 66px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kind === 'eye') {
    ctx.beginPath();
    ctx.ellipse(64, 64, 34, 18, 0, 0, Math.PI * 2);
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 64, 10, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const glyph = kind === 'question' ? '?' : kind === 'alert' ? '!' : kind === 'talk' ? '…' : 'Zz';
    ctx.font = kind === 'sleep' ? 'bold 44px sans-serif' : 'bold 66px sans-serif';
    ctx.fillText(glyph, 64, kind === 'alert' ? 76 : 66);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  iconCache.set(kind, mat);
  return mat;
}

function guardIcon(g: Guard): IconKind | null {
  if (g.status === 'ko' || g.status === 'restrained') return g.hiddenIn || g.carriedBy ? null : 'sleep';
  if (g.status === 'dead') return null;
  if (g.state === 'alerted' || g.state === 'combat' || g.state === 'challenge') return 'alert';
  if (g.state === 'suspicious' || g.state === 'investigate' || g.state === 'search' || g.state === 'revive') return 'question';
  if (g.state === 'distracted') return 'talk';
  const max = g.suspicion.reduce((m, e) => Math.max(m, e.value), 0);
  return max >= 15 || g.state === 'observe' ? 'eye' : null;
}

interface RigEntry {
  rig: FigureRig;
  key: string;
}

function unitKey(controller: GameController): string {
  const s = controller.world.state;
  return `${s.operatives.map((o) => o.id).join(',')}|${s.guards.map((g) => g.id).join(',')}|${s.objects
    .filter((o) => o.type === 'prisoner')
    .map((o) => o.id)
    .join(',')}`;
}

export interface UnitsProps {
  controller: GameController;
}

/** Squad, guards and prisoners. Invisible hitboxes (userData.kind) are picked by the input layer. */
export function Units({ controller }: UnitsProps) {
  const group = useRef<THREE.Group>(null);
  const rigs = useRef(new Map<string, RigEntry>());
  const rings = useRef(new Map<string, THREE.Mesh>());
  const icons = useRef(new Map<string, THREE.Sprite>());
  const hitboxes = useRef(new Map<string, THREE.Mesh>());
  const key = useSyncExternalStore(controller.subscribeHud, () => unitKey(controller), () => '');

  const lists = useMemo(() => {
    const [ops = '', guards = '', prisoners = ''] = key.split('|');
    const split = (v: string) => (v ? v.split(',') : []);
    return { ops: split(ops), guards: split(guards), prisoners: split(prisoners) };
  }, [key]);

  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.5, 0.62, 32).rotateX(-Math.PI / 2), []);
  const hitGeometry = useMemo(() => new THREE.CylinderGeometry(0.55, 0.55, 1.9, 8).translate(0, 0.95, 0), []);
  const hitMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }), []);

  const groundY = (pos: Vec2): number => {
    const { grid, level } = controller.world;
    const cell = grid.cellAt(pos);
    if (cell < 0) return 0;
    if (grid.hasFlag(cell, CellFlag.Deep)) return level.seaLevel;
    return Math.max(grid.heightAt(pos), level.cellHeight[cell]!);
  };

  const ensureRig = (id: string, lookKey: string, build: () => FigureRig): FigureRig => {
    const existing = rigs.current.get(id);
    if (existing && existing.key === lookKey) return existing.rig;
    if (existing) group.current?.remove(existing.rig.root);
    const rig = build();
    group.current?.add(rig.root);
    rigs.current.set(id, { rig, key: lookKey });
    return rig;
  };

  useFrame((frame, dt) => {
    const world = controller.world;
    const s = world.state;
    const time = frame.clock.elapsedTime;
    const ui = useGameUi.getState();

    const placeHitbox = (id: string, pos: Vec2, y: number, active: boolean) => {
      const hit = hitboxes.current.get(id);
      if (!hit) return;
      hit.position.set(pos.x, y, pos.z);
      hit.visible = active;
    };

    for (const op of s.operatives) {
      const look = op.disguised ? DISGUISED_LOOK : SQUAD_LOOKS[op.role];
      const rig = ensureRig(op.id, op.disguised ? 'disguised' : op.role, () => ({ ...createFigure(look) }));
      const pos = controller.interpolate(op.id, op.pos);
      const cell = world.grid.cellAt(op.pos);
      const swimming = world.grid.hasFlag(cell, CellFlag.Deep);
      const y = groundY(pos);
      const visible = op.status !== 'extracted' && !op.submerged;
      rig.root.visible = visible;
      rig.root.position.set(pos.x, y, pos.z);
      rig.root.rotation.y = -op.facing;
      const action = op.action;
      const moving = op.lastMoveTick >= s.tick - 1 && op.status === 'active';
      const pose: FigurePose = {
        stance: op.status === 'captured' ? 'stand' : op.stance,
        moving: moving || (op.status === 'captured' && op.escortedBy !== null),
        running: moving && op.lastGait === 'run' && op.stance !== 'prone',
        lying: op.status === 'downed' || op.status === 'dead' ? 'side' : 'none',
        carrying: op.carrying !== null,
        carried: false,
        aiming: action?.kind === 'channel' && ['rifle', 'dart', 'pistol', 'harpoon'].includes(action.abilityId),
        talking: action?.kind === 'converse',
        swimming,
        climbing: (action?.kind === 'move' || action?.kind === 'approach') && action.linkProgress > 0,
      };
      poseFigure(rig, pose, dt, time);

      let ring = rings.current.get(op.id);
      if (!ring && group.current) {
        ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: SPECIALIST_PROFILES[op.role].color, transparent: true, opacity: 0.9, depthWrite: false }));
        ring.renderOrder = 2;
        group.current.add(ring);
        rings.current.set(op.id, ring);
      }
      if (ring) {
        const selected = ui.selected.includes(op.id);
        const hovered = ui.hovered?.id === op.id;
        ring.visible = visible && (selected || hovered);
        ring.position.set(pos.x, y + 0.04, pos.z);
        (ring.material as THREE.MeshBasicMaterial).opacity = selected ? 0.95 : 0.45;
      }
      placeHitbox(op.id, pos, y, visible);
    }

    for (const g of s.guards) {
      const rig = ensureRig(g.id, `${g.rank}-${g.carriesLantern}`, () => createFigure(guardLook(g)));
      const carrier = g.carriedBy ? world.operative(g.carriedBy) : undefined;
      const pos = carrier ? controller.interpolate(carrier.id, carrier.pos) : controller.interpolate(g.id, g.pos);
      const elevated = g.eyeElevation > 0 && g.status === 'active' && g.path === null;
      const y = groundY(pos) + (elevated ? g.eyeElevation + 0.22 : 0);
      rig.root.visible = !g.hiddenIn;
      rig.root.position.set(pos.x, y, pos.z);
      rig.root.rotation.y = carrier ? -carrier.facing + Math.PI / 2 : -(g.facing + (g.status === 'active' ? g.look * 0.6 : 0));
      const moving = g.status === 'active' && g.path !== null;
      const pose: FigurePose = {
        stance: 'stand',
        moving,
        running: moving && (g.state === 'alerted' || g.state === 'combat'),
        lying: g.status === 'active' ? 'none' : 'back',
        carrying: false,
        carried: Boolean(carrier),
        aiming: g.state === 'combat' || g.state === 'challenge',
        talking: g.state === 'distracted',
        swimming: false,
        climbing: false,
      };
      poseFigure(rig, pose, dt, time);
      if (rig.lanternLight) rig.lanternLight.visible = g.status === 'active';

      const iconKind = guardIcon(g);
      let icon = icons.current.get(g.id);
      if (iconKind) {
        if (!icon && group.current) {
          icon = new THREE.Sprite(iconMaterial(iconKind));
          icon.scale.set(0.7, 0.7, 1);
          icon.renderOrder = 10;
          group.current.add(icon);
          icons.current.set(g.id, icon);
        }
        if (icon) {
          icon.material = iconMaterial(iconKind);
          icon.visible = !g.hiddenIn && !carrier;
          icon.position.set(pos.x, y + (g.status === 'active' ? 2.35 : 0.9), pos.z);
        }
      } else if (icon) icon.visible = false;
      placeHitbox(g.id, pos, y, !g.hiddenIn && !carrier);
    }

    for (const obj of s.objects) {
      if (obj.type !== 'prisoner') continue;
      const rig = ensureRig(obj.id, 'prisoner', () => createFigure(PRISONER_LOOK));
      const pos = controller.interpolate(obj.id, obj.pos);
      const leader = obj.following ? world.operative(obj.following) : undefined;
      const facing = leader ? Math.atan2(leader.pos.z - obj.pos.z, leader.pos.x - obj.pos.x) : 0;
      rig.root.visible = obj.alive && !obj.extracted;
      rig.root.position.set(pos.x, groundY(pos), pos.z);
      rig.root.rotation.y = -facing;
      const moving = Boolean(leader) && Math.hypot(leader!.pos.x - obj.pos.x, leader!.pos.z - obj.pos.z) > 1.9;
      poseFigure(rig, { stance: 'stand', moving, running: false, lying: obj.alive ? 'none' : 'back', carrying: false, carried: false, aiming: false, talking: false, swimming: false, climbing: false }, dt, time);
      placeHitbox(obj.id, pos, groundY(pos), obj.alive && !obj.extracted);
    }
  });

  const hit = (id: string, kind: NonNullable<HoverTarget>['kind']) => (
    <mesh
      key={id}
      ref={(m) => {
        if (m) hitboxes.current.set(id, m);
        else hitboxes.current.delete(id);
      }}
      geometry={hitGeometry}
      material={hitMaterial}
      userData={{ id, kind }}
    />
  );

  return (
    <group ref={group} name="units">
      {lists.ops.map((id) => hit(id, 'operative'))}
      {lists.guards.map((id) => hit(id, 'guard'))}
      {lists.prisoners.map((id) => hit(id, 'object'))}
    </group>
  );
}
