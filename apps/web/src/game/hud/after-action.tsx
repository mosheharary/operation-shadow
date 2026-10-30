'use client';

import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { ALARM_LABELS, type AlarmLevel, type Vec2 } from '@operation-shadow/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useController } from '../runtime/game-context';
import { alarmAt, type ChartView, chartView, type IncidentKind, objectivePos, positionAt, replayAtTick, replayPace, replaySeconds, routeLength, tickAtReplay, type TraceIncident } from '../runtime/trace';
import { Icon } from './icons';
import { renderBase } from './minimap';
import { formatClock } from './status-bar';
import styles from './hud.module.css';

/** Chart resolution; the canvas is scaled to the column by CSS. */
const CHART_WIDTH = 720;
const STRIP_HEIGHT = 30;
/** Seconds of replay an incident's stamp keeps its ripple after the playhead passes it. */
const STAMP_RIPPLE = 0.9;

/** Each kind of incident has a glyph and a colour, on the chart and in its key. */
const STAMPS: Record<IncidentKind, { glyph: string; color: string; label: string }> = {
  spotted: { glyph: '◉', color: '#ff6a4c', label: 'Spotted' },
  'body-found': { glyph: '!', color: '#f0a23a', label: 'Body found' },
  takedown: { glyph: '×', color: '#e4dcc4', label: 'Sentry taken out' },
  killed: { glyph: '✕', color: '#cf6a4f', label: 'Sentry killed' },
  objective: { glyph: '◆', color: '#e7c35a', label: 'Objective' },
  casualty: { glyph: '■', color: '#ff6a4c', label: 'Squad casualty' },
  extracted: { glyph: '✓', color: '#8fd18a', label: 'Extracted' },
};

const ALARM_BAND: Record<AlarmLevel, string> = {
  0: 'rgba(134, 161, 124, 0.35)',
  1: 'rgba(214, 201, 164, 0.55)',
  2: 'rgba(240, 162, 58, 0.7)',
  3: 'rgba(240, 110, 58, 0.85)',
  4: 'rgba(255, 70, 50, 0.95)',
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * The debrief's after-action chart: the whole attempt replayed in a few seconds on a plotting
 * table. Each squad member's route inks itself in their colour, incidents stamp the map as the
 * playhead passes them and the strip underneath shows the alarm over time. It can be scrubbed.
 */
export function AfterActionChart() {
  const controller = useController();
  const { trace, level } = controller;
  const endTick = controller.world.state.tick;
  const startTick = trace.startTick;
  const span = Math.max(1, endTick - startTick);
  // Quiet stretches play faster than busy ones (see replayPace).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { pace, weighted } = useMemo(() => replayPace(trace, endTick), [controller, endTick]);
  const seconds = replaySeconds(weighted);
  // The chart frames where the squad went, what happened and what was left to do.
  const view = useMemo(() => {
    const points: Vec2[] = [...trace.routes.flatMap((r) => r.points), ...trace.incidents.map((i) => i.pos)];
    for (const def of controller.mission.objectives) {
      const pos = controller.world.state.objectives.find((o) => o.id === def.id)?.status === 'hidden' ? null : objectivePos(controller.world, def.id);
      if (pos) points.push(pos);
    }
    return chartView(points, level);
    // Computed once per debrief: the attempt is over and its trace no longer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, endTick]);
  const height = Math.round((CHART_WIDTH * view.depth) / view.width);

  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0));
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const chart = useRef<HTMLCanvasElement>(null);
  const strip = useRef<HTMLCanvasElement>(null);
  const base = useMemo(() => (typeof document === 'undefined' ? null : renderBase(level)), [level]);
  // Where the replay clock picks up when it (re)starts; kept in step before that effect runs.
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  const playTick = tickAtReplay(pace, startTick, endTick, progress);
  /** Seconds of replay since the playhead passed a moment. */
  const ageOf = (tick: number) => (progress - replayAtTick(pace, startTick, endTick, tick)) * seconds;

  // The replay clock: real time, so a long mission and a short one both play in a few seconds.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let p = progressRef.current;
    const step = (now: number) => {
      p = Math.min(1, p + (now - last) / 1000 / seconds);
      last = now;
      setProgress(p);
      if (p >= 1) setPlaying(false);
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, seconds]);

  useEffect(() => {
    const ctx = chart.current?.getContext('2d');
    if (!ctx || !base) return;
    drawChart(ctx, base, { width: CHART_WIDTH, height, view, playTick, ageOf, controller });
    // ageOf changes with the playhead, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, controller, height, playTick, view]);

  useEffect(() => {
    const ctx = strip.current?.getContext('2d');
    if (!ctx) return;
    drawStrip(ctx, trace, startTick, span, playTick);
  }, [playTick, span, startTick, trace]);

  const alarm = alarmAt(trace.alarm, playTick);
  const passed = trace.incidents.filter((i) => i.tick <= playTick);
  const latest: TraceIncident | undefined = passed[passed.length - 1];
  const fresh = latest && ageOf(latest.tick) < 2.2 ? latest : undefined;
  const done = progress >= 1;
  const kinds = [...new Set(trace.incidents.map((i) => i.kind))];

  const toggle = () => {
    if (done) setProgress(0);
    setPlaying((p) => (done ? true : !p));
  };

  return (
    <section
      className={styles.afterAction}
      aria-labelledby="after-action-title"
      data-testid="after-action"
      data-state={done ? 'done' : playing ? 'playing' : 'paused'}
      data-routes={trace.routes.filter((r) => r.points.length > 1).length}
      data-incidents={trace.incidents.length}
      data-alarm={alarm}
    >
      <header className={styles.afterActionHead}>
        <h3 id="after-action-title">After-action chart</h3>
        <span className={styles.afterActionClock} data-testid="after-action-clock">
          {formatClock(playTick)} <small>/ {formatClock(endTick)}</small>
        </span>
      </header>
      <div className={styles.afterActionMap} data-alarm={alarm}>
        <canvas ref={chart} width={CHART_WIDTH} height={height} style={{ aspectRatio: `${view.width} / ${view.depth}` }} aria-label="The squad's routes and what happened along them" role="img" />
        {fresh && (
          <p key={`${fresh.tick}-${fresh.text}`} className={styles.afterActionCaption} style={{ color: STAMPS[fresh.kind].color }}>
            <span aria-hidden="true">{STAMPS[fresh.kind].glyph}</span> {fresh.text} <time>{formatClock(fresh.tick)}</time>
          </p>
        )}
      </div>
      <div className={styles.afterActionStrip}>
        <button type="button" className={styles.afterActionPlay} onClick={toggle} aria-label={done ? 'Replay the chart' : playing ? 'Pause the replay' : 'Play the replay'} data-testid="after-action-play">
          <Icon name={done ? 'rotate-left' : playing ? 'pause' : 'play'} size={14} />
        </button>
        <div className={styles.afterActionTrack}>
          <canvas ref={strip} width={CHART_WIDTH} height={STRIP_HEIGHT} aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(((playTick - startTick) / span) * 1000)}
            aria-label="Replay time"
            aria-valuetext={`${formatClock(playTick)}, ${ALARM_LABELS[alarm]}`}
            data-testid="after-action-scrub"
            onChange={(e) => {
              setPlaying(false);
              setProgress(replayAtTick(pace, startTick, endTick, startTick + (span * Number(e.currentTarget.value)) / 1000));
            }}
          />
        </div>
      </div>
      <ul className={styles.afterActionLegend}>
        {trace.routes.map((route) => {
          const op = controller.world.operative(route.id);
          const profile = SPECIALIST_PROFILES[route.role];
          const status = done && op && op.status !== 'active' ? op.status : null;
          return (
            <li key={route.id} style={{ ['--route' as string]: profile.color }}>
              <strong>{profile.callSign}</strong> {Math.round(routeLength(route, playTick))} m{status && <em> · {status}</em>}
            </li>
          );
        })}
      </ul>
      {kinds.length > 0 && (
        <ul className={styles.afterActionKey} aria-label="Chart key">
          {kinds.map((kind) => (
            <li key={kind}>
              <span style={{ color: STAMPS[kind].color }} aria-hidden="true">
                {STAMPS[kind].glyph}
              </span>
              {STAMPS[kind].label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ChartFrame {
  width: number;
  height: number;
  /** The ground the chart shows. */
  view: ChartView;
  playTick: number;
  /** Seconds of replay since the playhead passed a moment. */
  ageOf: (tick: number) => number;
  controller: ReturnType<typeof useController>;
}

function drawChart(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, f: ChartFrame): void {
  const { width, height, view, playTick, controller } = f;
  const { trace, level, mission } = controller;
  const k = width / view.width;
  const sx = (x: number) => (x - view.x) * k;
  const sy = (z: number) => (z - view.z) * k;
  ctx.clearRect(0, 0, width, height);

  // The ground as a faded plotting chart: sepia, dimmed, with a ten-metre grid.
  ctx.save();
  ctx.filter = 'grayscale(0.55) sepia(0.5) brightness(0.55) contrast(1.2)';
  ctx.imageSmoothingEnabled = true;
  const cell = base.width / level.width;
  ctx.drawImage(base, view.x * cell, view.z * cell, view.width * cell, view.depth * cell, 0, 0, width, height);
  ctx.restore();
  ctx.strokeStyle = 'rgba(221, 184, 107, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(view.x / 10) * 10; x < view.x + view.width; x += 10) {
    ctx.moveTo(Math.round(sx(x)) + 0.5, 0);
    ctx.lineTo(Math.round(sx(x)) + 0.5, height);
  }
  for (let z = Math.ceil(view.z / 10) * 10; z < view.z + view.depth; z += 10) {
    ctx.moveTo(0, Math.round(sy(z)) + 0.5);
    ctx.lineTo(width, Math.round(sy(z)) + 0.5);
  }
  ctx.stroke();

  const zone = level.zones.find((z) => z.id === mission.extractionZoneId);
  if (zone) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(143, 209, 138, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx(zone.min.x), sy(zone.min.z), (zone.max.x - zone.min.x) * k, (zone.max.z - zone.min.z) * k);
    ctx.setLineDash([]);
  }

  // Objectives still open when it ended: hollow diamonds where the work was waiting.
  ctx.strokeStyle = 'rgba(231, 195, 90, 0.9)';
  ctx.lineWidth = 2;
  for (const def of mission.objectives) {
    if (controller.world.state.objectives.find((o) => o.id === def.id)?.status !== 'active') continue;
    const pos = objectivePos(controller.world, def.id);
    if (!pos) continue;
    const x = sx(pos.x);
    const y = sy(pos.z);
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 9);
    ctx.lineTo(x - 7, y);
    ctx.closePath();
    ctx.stroke();
  }

  // Routes so far, each in its squad member's colour over a dark edge so it reads on any ground.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const route of trace.routes) {
    const first = route.points[0];
    if (!first) continue;
    const head = positionAt(route, playTick)!;
    const path = new Path2D();
    path.moveTo(sx(first.x), sy(first.z));
    for (const p of route.points) {
      if (p.tick > playTick) break;
      path.lineTo(sx(p.x), sy(p.z));
    }
    path.lineTo(sx(head.x), sy(head.z));
    ctx.strokeStyle = 'rgba(8, 10, 12, 0.7)';
    ctx.lineWidth = 5;
    ctx.stroke(path);
    ctx.strokeStyle = SPECIALIST_PROFILES[route.role].color;
    ctx.lineWidth = 2.4;
    ctx.stroke(path);
    // Where they came ashore.
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx(first.x), sy(first.z), 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Incidents the playhead has passed, a ripple on the newest.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const incident of trace.incidents) {
    if (incident.tick > playTick) break;
    const stamp = STAMPS[incident.kind];
    const x = sx(incident.pos.x);
    const y = sy(incident.pos.z);
    const age = f.ageOf(incident.tick);
    if (age < STAMP_RIPPLE) {
      const t = age / STAMP_RIPPLE;
      ctx.strokeStyle = stamp.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 9 + t * 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(10, 12, 14, 0.82)';
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = stamp.color;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(stamp.glyph, x, y + 0.5);
  }

  // Each squad member where they stood at that moment, initial on a disc.
  ctx.font = 'bold 10px system-ui, sans-serif';
  for (const route of trace.routes) {
    const head = positionAt(route, playTick);
    if (!head) continue;
    const profile = SPECIALIST_PROFILES[route.role];
    ctx.fillStyle = profile.color;
    ctx.strokeStyle = '#0b0d0f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx(head.x), sy(head.z), 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0b0d0f';
    ctx.fillText(profile.callSign[0]!, sx(head.x), sy(head.z) + 0.5);
  }
}

function drawStrip(ctx: CanvasRenderingContext2D, trace: ReturnType<typeof useController>['trace'], startTick: number, span: number, playTick: number): void {
  const w = CHART_WIDTH;
  const h = STRIP_HEIGHT;
  const xOf = (tick: number) => ((tick - startTick) / span) * w;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8, 10, 12, 0.85)';
  ctx.fillRect(0, 0, w, h);
  // The alarm as a band whose height and colour rise with the level.
  trace.alarm.forEach((step, i) => {
    const next = trace.alarm[i + 1];
    const x0 = Math.max(0, xOf(step.tick));
    const x1 = next ? xOf(next.tick) : w;
    const bandH = 4 + step.level * 3.5;
    ctx.fillStyle = ALARM_BAND[step.level];
    ctx.fillRect(x0, h - bandH, Math.max(1, x1 - x0), bandH);
  });
  for (const incident of trace.incidents) {
    ctx.fillStyle = STAMPS[incident.kind].color;
    ctx.fillRect(Math.round(xOf(incident.tick)) - 1, 2, 2, 9);
  }
  // What has played is lit, what is still to come is shaded.
  const px = xOf(playTick);
  ctx.fillStyle = 'rgba(8, 10, 12, 0.5)';
  ctx.fillRect(px, 0, w - px, h);
  ctx.fillStyle = '#ddb86b';
  ctx.fillRect(Math.round(px) - 1, 0, 2, h);
}
