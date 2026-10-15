import type { TemplateDef } from '../spec';
import { ALPINE_TEMPLATE } from './alpine';
import { COASTAL_TEMPLATE } from './coastal';
import { RAIL_TEMPLATE } from './rail';
import { TRAINING_TEMPLATE } from './training';

export { ALPINE_TEMPLATE, COASTAL_TEMPLATE, RAIL_TEMPLATE, TRAINING_TEMPLATE };

export const TEMPLATES: Record<string, TemplateDef> = {
  [COASTAL_TEMPLATE.id]: COASTAL_TEMPLATE,
  [ALPINE_TEMPLATE.id]: ALPINE_TEMPLATE,
  [RAIL_TEMPLATE.id]: RAIL_TEMPLATE,
  [TRAINING_TEMPLATE.id]: TRAINING_TEMPLATE,
};

/** Templates the mission generator may use (the training ground is tutorial-only). */
export const GENERATOR_TEMPLATES: readonly TemplateDef[] = [COASTAL_TEMPLATE, ALPINE_TEMPLATE, RAIL_TEMPLATE];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES[id];
}
