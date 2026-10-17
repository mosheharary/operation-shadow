'use client';

import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { CellFlag, type Guard, type LevelData, Surface } from '@operation-shadow/engine';
import { useEffect, useMemo, useRef } from 'react';
import { focusOn } from '../camera/camera-rig';
import { resolveContextAction } from '../input/context-action';
import { useController } from '../runtime/game-context';
import { useGameUi } from '../runtime/store';
import styles from './hud.module.css';

const SCALE = 1.5;

const SURFACE_RGB: Partial<Record<Surface, [number, number, number]>> = {
  [Surface.Grass]: [62, 72, 44],
  [Surface.Dirt]: [84, 70, 52],
  [Surface.Gravel]: [92, 89, 80],
  [Surface.Sand]: [128, 116, 88],
  [Surface.Mud]: [70, 58, 44],
  [Surface.Stone]: [88, 86, 80],
  [Surface.Concrete]: [100, 99, 94],
  [Surface.Wood]: [96, 74, 50],
  [Surface.Metal]: [84, 88, 92],
  [Surface.ShallowWater]: [48, 70, 80],
  [Surface.DeepWater]: [28, 42, 52],
  [Surface.Rock]: [80, 78, 72],
};

/** Static base layer: ground, water, buildings and walls, one pixel per metre-pair. */
function renderBase(level: LevelData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = level.cols;
  canvas.height = level.rows;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(level.cols, level.rows);
  for (let cell = 0; cell < level.cols * level.rows; cell += 1) {
    const flags = level.flags[cell]!;
    let rgb = SURFACE_RGB[level.surface[cell] as Surface] ?? [60, 60, 60];
    if (flags & CellFlag.Deep) rgb = SURFACE_RGB[Surface.DeepWater]!;
    const wall = level.occluders.lowTop[cell]! > 1.2 || level.occluders.highTop[cell]! > 1.2;
    if (wall) rgb = [150, 142, 124];
    else if (flags & CellFlag.Indoor) rgb = [44, 44, 46];
    else if (!(flags & CellFlag.Walkable) && !(flags & CellFlag.Deep)) rgb = [rgb[0] * 0.7, rgb[1] * 0.7, rgb[2] * 0.7];
    const shade = 0.85 + Math.min(0.3, level.cellHeight[cell]! * 0.012);
    image.data[cell * 4] = rgb[0] * shade;
    image.data[cell * 4 + 1] = rgb[1] * shade;
    image.data[cell * 4 + 2] = rgb[2] * shade;
    image.data[cell * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function guardColor(g: Guard): string {
  if (g.status !== 'active') return '#7d8488';
  if (g.state === 'alerted' || g.state === 'combat' || g.state === 'challenge') return '#ff5a3c';
  if (g.state === 'suspicious' || g.state === 'investigate' || g.state === 'search') return '#f0a23a';
  return '#d6c9a4';
}

/** Tactical map: click to look there, right-click to send the selected squad. */
export function Minimap() {
  const controller = useController();
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useMemo(() => (typeof document === 'undefined' ? null : renderBase(controller.level)), [controller]);
  const { width, depth } = controller.level;
  const w = Math.round(width * SCALE);
  const h = Math.round(depth * SCALE);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      const ctx = canvas.current?.getContext('2d');
      if (!ctx || !base) return;
      const world = controller.world;
      const s = world.state;
      const ui = useGameUi.getState();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base, 0, 0, w, h);
      const k = SCALE;

      const zone = controller.level.zones.find((z) => z.id === controller.mission.extractionZoneId);
      if (zone) {
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = '#8fd18a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(zone.min.x * k, zone.min.z * k, (zone.max.x - zone.min.x) * k, (zone.max.z - zone.min.z) * k);
        ctx.setLineDash([]);
      }

      for (const def of controller.mission.objectives) {
        const state = s.objectives.find((o) => o.id === def.id);
        if (state?.status !== 'active') continue;
        const id = def.kind === 'disable-target' ? def.targetId : def.kind === 'acquire-item' ? def.itemObjectId : def.kind === 'rescue' ? def.prisonerId : null;
        const obj = id ? world.object(id) : undefined;
        if (!obj) continue;
        ctx.fillStyle = '#e7c35a';
        ctx.beginPath();
        ctx.moveTo(obj.pos.x * k, obj.pos.z * k - 5);
        ctx.lineTo(obj.pos.x * k + 4, obj.pos.z * k);
        ctx.lineTo(obj.pos.x * k, obj.pos.z * k + 5);
        ctx.lineTo(obj.pos.x * k - 4, obj.pos.z * k);
        ctx.closePath();
        ctx.fill();
      }

      for (const g of s.guards) {
        if (g.hiddenIn || g.carriedBy) continue;
        const x = g.pos.x * k;
        const y = g.pos.z * k;
        ctx.fillStyle = guardColor(g);
        if (g.status === 'active') {
          const a = g.facing + g.look;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5);
          ctx.lineTo(x + Math.cos(a + 2.5) * 3, y + Math.sin(a + 2.5) * 3);
          ctx.lineTo(x + Math.cos(a - 2.5) * 3, y + Math.sin(a - 2.5) * 3);
          ctx.closePath();
          ctx.fill();
        } else ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }

      for (const op of s.operatives) {
        if (op.status === 'extracted' || op.status === 'dead') continue;
        const x = op.pos.x * k;
        const y = op.pos.z * k;
        ctx.fillStyle = SPECIALIST_PROFILES[op.role].color;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        if (ui.selected.includes(op.id)) {
          ctx.strokeStyle = '#f2efe6';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, 5.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const focus = ui.groundPoint;
      if (focus) {
        ctx.strokeStyle = 'rgba(242,239,230,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(focus.x * k - 3, focus.z * k - 3, 6, 6);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [base, controller, h, w]);

  const toWorld = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * width, z: ((e.clientY - rect.top) / rect.height) * depth };
  };

  return (
    <section className={styles.minimap} aria-label="Tactical map">
      <canvas
        ref={canvas}
        width={w}
        height={h}
        style={{ aspectRatio: `${width} / ${depth}` }}
        data-tip="Click to look there; right-click to send the selected squad there"
        data-tip-pos="below"
        onClick={(e) => focusOn(toWorld(e))}
        onContextMenu={(e) => {
          e.preventDefault();
          const ui = useGameUi.getState();
          const action = resolveContextAction(controller.world, ui.selected, null, toWorld(e));
          if (action.kind === 'move') {
            const result = controller.command(action.command);
            if (!result.ok) ui.toast(result.message);
            else ui.markOrder(action.command.target, 'move');
          } else if (action.kind === 'blocked') ui.toast(action.message);
        }}
      />
    </section>
  );
}
