import { generateRail, RAIL_GENERATOR_VERSION, RAIL_TEMPLATE_ID } from '../../levelgen/rail';
import type { TemplateDef } from '../spec';

/** Corvan Junction: a marshalling yard with an ammunition train, signal box and station. */
export const RAIL_TEMPLATE: TemplateDef = {
  id: RAIL_TEMPLATE_ID,
  name: 'Corvan Junction',
  theme: 'rail',
  version: RAIL_GENERATOR_VERSION,
  description:
    'A rail junction at dusk: woods and a fenced perimeter in the south, a marshalling yard with four tracks of wagons and an ammunition train, an engine shed and lock-up, and the station, signal box and guardhouse in the north.',
  sectors: ['woods', 'yard', 'station'],
  generate: (seed, id) => generateRail({ seed, id }),
  guards: [
    { id: 'crossing', sector: 'yard', post: 'post:crossing', priority: 1 },
    { id: 'fence-line', sector: 'yard', route: 'route:fence-line', priority: 2, lantern: true },
    { id: 'yard-north', sector: 'yard', route: 'route:yard-north', priority: 1 },
    { id: 'yard-south', sector: 'yard', route: 'route:yard-south', priority: 1, lantern: true },
    { id: 'sheds', sector: 'yard', route: 'route:sheds', priority: 2 },
    { id: 'ammo-west', sector: 'yard', post: 'post:ammo-west', priority: 1, temperament: 'strict' },
    { id: 'ammo-east', sector: 'yard', post: 'post:ammo-east', priority: 2 },
    { id: 'shed-door', sector: 'yard', post: 'post:shed-door', priority: 2 },
    { id: 'lockup-door', sector: 'yard', post: 'post:lockup-door', priority: 1, temperament: 'passive' },
    { id: 'depot-officer', sector: 'yard', post: 'post:depot-office', priority: 1, rank: 'officer', temperament: 'strict' },
    { id: 'tower', sector: 'yard', post: 'post:tower-yard', priority: 2 },
    { id: 'platform', sector: 'station', route: 'route:platform', priority: 1 },
    { id: 'platform-post', sector: 'station', post: 'post:platform', priority: 3 },
    { id: 'signal-door', sector: 'station', post: 'post:signal-door', priority: 1 },
    { id: 'station-officer', sector: 'station', post: 'post:station-inside', priority: 2, rank: 'officer' },
    { id: 'guardhouse', sector: 'station', post: 'post:guardhouse', priority: 2, radio: true },
  ],
  reinforcements: [
    { sector: 'station', pos: { x: 125, z: 34 }, count: 3 },
    { sector: 'yard', pos: { x: 112, z: 64.5 }, count: 3 },
  ],
  extractionZoneId: 'extraction',
  holdingZoneId: 'holding',
  defaults: { timeOfDay: 20, weather: 'fog', parSeconds: 1000 },
  slots: [
    { id: 'ammo-train', tag: 'objective-target', label: 'ammunition train in the yard', sector: 'yard' },
    { id: 'signal-console', tag: 'objective-target', label: 'signal box levers', sector: 'station' },
    { id: 'fuel-store', tag: 'objective-target', label: 'engine-shed fuel store', sector: 'yard' },
    { id: 'station-office', tag: 'item', label: "stationmaster's office", sector: 'station' },
    { id: 'depot-desk', tag: 'item', label: 'depot office', sector: 'yard' },
    { id: 'lockup-cell', tag: 'prisoner', label: 'yard lock-up', sector: 'yard' },
    { id: 'shed-pit', tag: 'prisoner', label: 'engine shed', sector: 'yard' },
  ],
};
