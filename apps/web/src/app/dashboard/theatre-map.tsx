'use client';

import Link from 'next/link';
import { type CSSProperties, type KeyboardEvent, useEffect, useState } from 'react';
import { CHART, focusStop, routePath, type TheatreStop, travelledStops } from './theatre';
import styles from './theatre.module.css';

const STATE_TEXT: Record<TheatreStop['state'], string> = { done: 'Completed', next: 'Next operation', open: 'Not yet attempted' };

/**
 * Field HQ's theatre map: a plotting-table chart of the Northern Reach with every campaign mission pinned where it
 * happens, the course the squad has travelled inked in brass, and the next target pulsing. Hovering or selecting a pin
 * brings its dossier card up beside the chart; the card leads into the briefing. Pointing at a campaign entry in the
 * mission list (anything marked data-theatre-key) lights up its pin too.
 */
export function TheatreMap({ stops }: { stops: TheatreStop[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = stops.find((s) => s.key === (hovered ?? picked)) ?? focusStop(stops);
  const fullRoute = routePath(stops);
  const travelled = routePath(travelledStops(stops));

  useEffect(() => {
    const keyOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('[data-theatre-key]')?.dataset.theatreKey : undefined);
    const over = (e: Event) => {
      const key = keyOf(e.target);
      if (key) setHovered(key);
    };
    const out = (e: Event) => {
      if (keyOf(e.target) && !keyOf((e as MouseEvent | FocusEvent).relatedTarget)) setHovered(null);
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', out);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      document.removeEventListener('focusin', over);
      document.removeEventListener('focusout', out);
    };
  }, []);

  const onKey = (key: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPicked(key);
    }
  };

  return (
    <div className={styles.theatre} data-testid="theatre">
      <svg className={styles.chart} viewBox={`0 0 ${CHART.width} ${CHART.height}`} preserveAspectRatio="xMidYMid slice" role="group" aria-label="Theatre map of the Northern Reach">
        <defs>
          <pattern id="theatre-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className={styles.hatch} />
          </pattern>
          <pattern id="theatre-waves" width="18" height="8" patternUnits="userSpaceOnUse">
            <path d="M 0 5 q 4.5 -3 9 0 t 9 0" className={styles.waves} />
          </pattern>
          <radialGradient id="theatre-vignette" cx="50%" cy="50%" r="70%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
        </defs>

        {/* Sea, graticule and land. */}
        <rect width={CHART.width} height={CHART.height} className={styles.sea} />
        <rect width={CHART.width} height={CHART.height} fill="url(#theatre-waves)" />
        <path
          className={styles.land}
          d="M 132 0 C 118 30 96 44 100 72 C 104 98 74 110 70 138 C 66 160 96 166 92 176 C 88 188 58 186 52 206 C 46 228 84 246 104 262 C 122 276 128 290 134 300 L 400 300 L 400 0 Z"
        />
        <g className={styles.graticule}>
          {[50, 100, 150, 200, 250, 300, 350].map((x) => (
            <line key={`x${x}`} x1={x} y1={0} x2={x} y2={CHART.height} />
          ))}
          {[50, 100, 150, 200, 250].map((y) => (
            <line key={`y${y}`} x1={0} y1={y} x2={CHART.width} y2={y} />
          ))}
        </g>

        {/* Dominion-held ground beyond the front line. */}
        <path className={styles.enemy} d="M 100 0 L 400 0 L 400 214 C 360 220 330 214 300 228 C 266 244 248 270 232 300 L 120 300 L 60 200 L 60 0 Z" fill="url(#theatre-hatch)" />
        <path className={styles.front} d="M 232 300 C 248 270 266 244 300 228 C 330 214 360 220 400 214" />

        {/* Whitecrown: contour rings and peaks. */}
        <g className={styles.relief}>
          <ellipse cx="292" cy="66" rx="70" ry="38" />
          <ellipse cx="294" cy="64" rx="48" ry="25" />
          <ellipse cx="296" cy="62" rx="26" ry="13" />
          <path d="M 250 86 l 9 -15 l 9 15 M 316 48 l 10 -17 l 10 17 M 330 92 l 7 -12 l 7 12 M 262 40 l 7 -12 l 7 12" />
        </g>

        {/* Railways meeting at Corvan, with sleeper ticks. */}
        <g className={styles.rail}>
          <path d="M 150 300 C 170 240 190 190 206 150 C 224 108 300 120 400 108" />
          <path d="M 96 120 C 140 128 180 140 206 150 C 250 168 330 160 400 176" />
        </g>
        <g className={styles.railTicks}>
          <path d="M 150 300 C 170 240 190 190 206 150 C 224 108 300 120 400 108" />
          <path d="M 96 120 C 140 128 180 140 206 150 C 250 168 330 160 400 176" />
        </g>

        <text x="22" y="120" className={styles.seaLabel} transform="rotate(-72 22 120)">
          Varrow Strait
        </text>
        <text x="128" y="246" className={styles.regionLabel}>
          Iron Dominion
        </text>
        <text x="292" y="286" className={styles.regionLabel}>
          Coalition lines
        </text>

        {/* The campaign course: dashed in full, inked in brass as far as the squad has come. */}
        <path className={styles.route} d={fullRoute} />
        <path className={styles.travelled} d={travelled} pathLength={1} />

        {stops.map((stop, i) => {
          const selected = stop.key === focus?.key;
          const labelLeft = stop.x > CHART.width - 110;
          return (
            <g
              key={stop.key}
              className={styles.pin}
              data-state={stop.state}
              data-selected={selected || undefined}
              data-testid={`theatre-pin-${stop.key}`}
              transform={`translate(${stop.x} ${stop.y})`}
              style={{ '--pin-delay': `${500 + i * 180}ms` } as CSSProperties}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${stop.label}: ${stop.title}, ${stop.place}. ${STATE_TEXT[stop.state]}${stop.rank ? `, rank ${stop.rank}` : ''}`}
              onClick={() => setPicked(stop.key)}
              onKeyDown={onKey(stop.key)}
              onMouseEnter={() => setHovered(stop.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setPicked(stop.key)}
            >
              {stop.state === 'next' && <circle r="15" className={styles.pulse} />}
              <circle r="18" className={styles.hit} />
              <circle r="8" className={styles.marker} />
              {stop.state === 'done' ? (
                <path d="M -3.5 0.5 l 2.5 2.5 l 4.5 -5" className={styles.tick} />
              ) : (
                <circle r="2.4" className={styles.dot} />
              )}
              <g transform={`translate(${labelLeft ? -13 : 13} 0)`} textAnchor={labelLeft ? 'end' : 'start'}>
                <text y="-2" className={styles.pinLabel}>
                  {stop.place}
                </text>
                <text y="9" className={styles.pinSub}>
                  {stop.state === 'done' ? `Rank ${stop.rank}` : stop.state === 'next' ? 'Next' : stop.label}
                </text>
              </g>
            </g>
          );
        })}

        {/* Compass and frame. */}
        <g className={styles.compass} transform="translate(372 30)">
          <circle r="14" />
          <path d="M 0 -18 L 4 0 L 0 18 L -4 0 Z" />
          <text y="-22">N</text>
        </g>
        <rect width={CHART.width} height={CHART.height} fill="url(#theatre-vignette)" pointerEvents="none" />
        <rect x="0.5" y="0.5" width={CHART.width - 1} height={CHART.height - 1} className={styles.frame} />
      </svg>

      {focus && (
        <article className={styles.card} data-state={focus.state} data-testid="theatre-card" aria-live="polite">
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-generated dossier art, served as-is */}
          <img key={focus.key} className={styles.cardImage} src={focus.dossierImage} alt="" width={1024} height={576} />
          <div className={styles.cardBody}>
            <p className={styles.cardEyebrow}>
              {focus.label} · {STATE_TEXT[focus.state]}
              {focus.rank && <span className={styles.cardRank}>Rank {focus.rank}</span>}
            </p>
            <h3 className={styles.cardTitle}>{focus.codename}</h3>
            <p className={styles.cardMeta}>
              {focus.place} · {focus.time} · {focus.weather}
            </p>
            <p className={styles.cardSummary}>{focus.summary}</p>
            <Link className="btn btn--primary" href={`/missions/${focus.key}`} data-testid="theatre-briefing">
              {focus.state === 'done' ? 'Replay briefing' : 'Open briefing'}
            </Link>
          </div>
        </article>
      )}
    </div>
  );
}
