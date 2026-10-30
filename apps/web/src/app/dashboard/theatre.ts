import type { MissionEntry } from '@operation-shadow/content';

/**
 * The theatre map on Field HQ: where each campaign mission sits on the chart of the Northern Reach and how far the
 * squad has come along the campaign route. Pure data so the page and the unit tests share it.
 */

/** Chart size in SVG units; the map art in theatre-map.tsx is drawn on the same grid. */
export const CHART = { width: 400, height: 300 } as const;

/** Where each campaign mission is pinned on the chart, and the short place name printed beside the pin. */
export const THEATRE_POSITIONS: Record<string, { x: number; y: number; place: string }> = {
  'boot-camp': { x: 328, y: 252, place: 'Training camp' },
  'silent-tide': { x: 84, y: 176, place: 'Varrow Harbor' },
  'white-silence': { x: 288, y: 66, place: 'Whitecrown Ridge' },
  'iron-junction': { x: 206, y: 150, place: 'Corvan Junction' },
};

/** done: finished at least once; next: the first unfinished mission in campaign order; open: playable, not yet reached. */
export type StopState = 'done' | 'next' | 'open';

export interface TheatreStop {
  key: string;
  /** "Training" or "Operation 2". */
  label: string;
  title: string;
  codename: string;
  place: string;
  time: string;
  weather: string;
  summary: string;
  dossierImage: string;
  x: number;
  y: number;
  state: StopState;
  rank?: string;
}

/** The campaign's stops in order, each with its place on the chart and its progress state. */
export function theatreStops(campaign: readonly MissionEntry[], completed: Readonly<Record<string, { bestRank: string }>>): TheatreStop[] {
  let nextGiven = false;
  return campaign.flatMap((mission, i) => {
    const at = THEATRE_POSITIONS[mission.key];
    if (!at) return [];
    const done = completed[mission.key];
    let state: StopState = 'open';
    if (done) state = 'done';
    else if (!nextGiven) {
      state = 'next';
      nextGiven = true;
    }
    const b = mission.briefing;
    return [
      {
        key: mission.key,
        label: mission.tutorial ? 'Training' : `Operation ${i}`,
        title: mission.title,
        codename: b.codename,
        place: at.place,
        time: b.time,
        weather: b.weather,
        summary: mission.summary,
        dossierImage: b.dossierImage,
        x: at.x,
        y: at.y,
        state,
        ...(done ? { rank: done.bestRank } : {}),
      },
    ];
  });
}

/** The stop the map opens on: the next mission, or the last one once the whole campaign is done. */
export function focusStop(stops: readonly TheatreStop[]): TheatreStop | undefined {
  return stops.find((s) => s.state === 'next') ?? stops.at(-1);
}

/**
 * An SVG path through the points, each leg bowed slightly to one side like a hand-plotted course line. Legs alternate
 * sides so the route reads as a winding track rather than a zigzag of straight cuts.
 */
export function routePath(points: readonly { x: number; y: number }[]): string {
  const [first, ...rest] = points;
  if (!first) return '';
  let d = `M ${first.x} ${first.y}`;
  let prev = first;
  rest.forEach((p, i) => {
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const bow = i % 2 === 0 ? 0.2 : -0.2;
    const cx = Math.round((prev.x + dx / 2 - dy * bow) * 10) / 10;
    const cy = Math.round((prev.y + dy / 2 + dx * bow) * 10) / 10;
    d += ` Q ${cx} ${cy} ${p.x} ${p.y}`;
    prev = p;
  });
  return d;
}

/** The stops the squad has already travelled through: everything up to and including the next mission. */
export function travelledStops(stops: readonly TheatreStop[]): TheatreStop[] {
  const next = stops.findIndex((s) => s.state === 'next');
  return next === -1 ? [...stops] : stops.slice(0, next + 1);
}
