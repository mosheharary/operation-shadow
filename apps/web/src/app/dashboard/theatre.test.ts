import { CAMPAIGN } from '@operation-shadow/content';
import { describe, expect, it } from 'vitest';
import { CHART, focusStop, routePath, THEATRE_POSITIONS, theatreStops, travelledStops } from './theatre';

describe('theatre map', () => {
  it('pins every campaign mission inside the chart', () => {
    for (const mission of CAMPAIGN) {
      const at = THEATRE_POSITIONS[mission.key];
      expect(at, mission.key).toBeDefined();
      expect(at!.x).toBeGreaterThan(0);
      expect(at!.x).toBeLessThan(CHART.width);
      expect(at!.y).toBeGreaterThan(0);
      expect(at!.y).toBeLessThan(CHART.height);
    }
  });

  it('marks the first unfinished mission as next and focuses it', () => {
    const stops = theatreStops(CAMPAIGN, { 'boot-camp': { bestRank: 'A' } });
    expect(stops.map((s) => s.state)).toEqual(['done', 'next', 'open', 'open']);
    expect(stops[0]!.rank).toBe('A');
    expect(stops[1]!.label).toBe('Operation 1');
    expect(focusStop(stops)?.key).toBe('silent-tide');
    expect(travelledStops(stops).map((s) => s.key)).toEqual(['boot-camp', 'silent-tide']);
  });

  it('starts a new operator on the tutorial', () => {
    const stops = theatreStops(CAMPAIGN, {});
    expect(stops[0]).toMatchObject({ key: 'boot-camp', label: 'Training', state: 'next' });
    expect(travelledStops(stops)).toHaveLength(1);
  });

  it('skips ahead past missions finished out of order', () => {
    const stops = theatreStops(CAMPAIGN, { 'boot-camp': { bestRank: 'B' }, 'silent-tide': { bestRank: 'C' }, 'iron-junction': { bestRank: 'A' } });
    expect(stops.map((s) => s.state)).toEqual(['done', 'done', 'next', 'done']);
  });

  it('focuses the last stop once the whole campaign is done', () => {
    const all = Object.fromEntries(CAMPAIGN.map((m) => [m.key, { bestRank: 'S' }]));
    const stops = theatreStops(CAMPAIGN, all);
    expect(focusStop(stops)?.key).toBe(CAMPAIGN.at(-1)!.key);
    expect(travelledStops(stops)).toHaveLength(CAMPAIGN.length);
  });

  it('plots a curved leg between each pair of stops', () => {
    expect(routePath([])).toBe('');
    expect(routePath([{ x: 0, y: 0 }])).toBe('M 0 0');
    const d = routePath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(d).toBe('M 0 0 Q 50 20 100 0 Q 120 50 100 100');
  });
});
