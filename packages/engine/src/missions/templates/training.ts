import { generateTraining, TRAINING_GENERATOR_VERSION, TRAINING_TEMPLATE_ID } from '../../levelgen/training';
import type { TemplateDef } from '../spec';

/** Boot Camp: the tutorial training ground (not offered to the mission generator). */
export const TRAINING_TEMPLATE: TemplateDef = {
  id: TRAINING_TEMPLATE_ID,
  name: 'Boot Camp',
  theme: 'training',
  version: TRAINING_GENERATOR_VERSION,
  description: 'A fenced training camp with a grass field, a drill yard, an armory and a guarded gate.',
  sectors: ['camp'],
  generate: (seed, id) => generateTraining({ seed, id }),
  guards: [
    { id: 'field', sector: 'camp', post: 'post:field', priority: 1 },
    { id: 'drill', sector: 'camp', post: 'post:drill', priority: 1, temperament: 'passive' },
    { id: 'gate', sector: 'camp', post: 'post:gate', priority: 1 },
    { id: 'camp', sector: 'camp', route: 'route:camp', priority: 3 },
  ],
  reinforcements: [],
  extractionZoneId: 'extraction',
  holdingZoneId: null,
  defaults: { timeOfDay: 21, weather: 'clear', parSeconds: 600 },
  slots: [{ id: 'armory-papers', tag: 'item', label: 'armory', sector: 'camp' }],
};
