import { ALPINE_GENERATOR_VERSION, ALPINE_TEMPLATE_ID, generateAlpine } from '../../levelgen/alpine';
import type { TemplateDef } from '../spec';

/** Whitecrown Ridge: snowy woods, an icy gorge, a mountain hamlet and a cliff-top radar station. */
export const ALPINE_TEMPLATE: TemplateDef = {
  id: ALPINE_TEMPLATE_ID,
  name: 'Whitecrown Ridge',
  theme: 'alpine',
  version: ALPINE_GENERATOR_VERSION,
  description:
    'A snowy mountain valley: pine woods in the west, an icy gorge crossed by a guarded bridge and a log, a hamlet with barracks, a chalet, a fuel depot and a lock-up, and a fenced radar station on a cliff plateau reached by a switchback road.',
  sectors: ['woods', 'gorge', 'hamlet', 'station'],
  generate: (seed, id) => generateAlpine({ seed, id }),
  guards: [
    { id: 'bridge-west', sector: 'gorge', post: 'post:bridge-west', priority: 1 },
    { id: 'bridge-east', sector: 'gorge', post: 'post:bridge-east', priority: 2 },
    { id: 'woods', sector: 'woods', route: 'route:west-woods', priority: 2, lantern: true },
    { id: 'valley-road', sector: 'hamlet', route: 'route:valley-road', priority: 1 },
    { id: 'hamlet', sector: 'hamlet', route: 'route:hamlet', priority: 2, lantern: true },
    { id: 'chalet-officer', sector: 'hamlet', post: 'post:chalet-inside', priority: 1, rank: 'officer', temperament: 'strict' },
    { id: 'chalet-door', sector: 'hamlet', post: 'post:chalet-door', priority: 2 },
    { id: 'lockup-door', sector: 'hamlet', post: 'post:lockup-door', priority: 1, temperament: 'passive' },
    { id: 'depot', sector: 'hamlet', post: 'post:depot', priority: 1 },
    { id: 'workshop', sector: 'hamlet', post: 'post:workshop', priority: 3 },
    { id: 'cliff-path', sector: 'hamlet', route: 'route:cliff-path', priority: 3 },
    { id: 'ramp-foot', sector: 'station', post: 'post:ramp-foot', priority: 2 },
    { id: 'ramp', sector: 'station', route: 'route:ramp', priority: 2 },
    { id: 'gate', sector: 'station', post: 'post:gate', priority: 1, temperament: 'strict' },
    { id: 'radar-door', sector: 'station', post: 'post:radar-door', priority: 1, temperament: 'strict' },
    { id: 'radar-operator', sector: 'station', post: 'post:radar-inside', priority: 1, temperament: 'passive', radio: true },
    { id: 'station-yard', sector: 'station', route: 'route:station-yard', priority: 1 },
    { id: 'station-officer', sector: 'station', route: 'route:station-yard', routeStart: 2, priority: 3, rank: 'officer', temperament: 'strict' },
    { id: 'tower', sector: 'station', post: 'post:tower-station', priority: 2 },
  ],
  reinforcements: [
    { sector: 'station', pos: { x: 101, z: 19.5 }, count: 3 },
    { sector: 'hamlet', pos: { x: 105, z: 64.5 }, count: 3 },
  ],
  extractionZoneId: 'extraction',
  holdingZoneId: 'holding',
  defaults: { timeOfDay: 13, weather: 'snow', parSeconds: 1000 },
  slots: [
    { id: 'radar-console', tag: 'objective-target', label: 'radar console in the station bunker', sector: 'station' },
    { id: 'signal-hut', tag: 'objective-target', label: 'station signal hut', sector: 'station' },
    { id: 'fuel-depot', tag: 'objective-target', label: 'hamlet fuel depot', sector: 'hamlet' },
    { id: 'chalet-desk', tag: 'item', label: "commandant's chalet", sector: 'hamlet' },
    { id: 'quarters-locker', tag: 'item', label: 'station quarters', sector: 'station' },
    { id: 'lockup-cell', tag: 'prisoner', label: 'hamlet lock-up', sector: 'hamlet' },
    { id: 'lodge', tag: 'prisoner', label: 'hunting lodge in the woods', sector: 'woods' },
  ],
};
