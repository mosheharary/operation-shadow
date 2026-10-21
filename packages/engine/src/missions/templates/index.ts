import type { TemplateDef } from '../spec';
import { ALPINE_TEMPLATE } from './alpine';
import { COASTAL_TEMPLATE } from './coastal';
import { RAIL_TEMPLATE } from './rail';
import { parseSiteTemplate, siteTemplate } from './site';
import { TRAINING_TEMPLATE } from './training';

export { ALPINE_TEMPLATE, COASTAL_TEMPLATE, RAIL_TEMPLATE, siteTemplate, TRAINING_TEMPLATE };

export const TEMPLATES: Record<string, TemplateDef> = {
  [COASTAL_TEMPLATE.id]: COASTAL_TEMPLATE,
  [ALPINE_TEMPLATE.id]: ALPINE_TEMPLATE,
  [RAIL_TEMPLATE.id]: RAIL_TEMPLATE,
  [TRAINING_TEMPLATE.id]: TRAINING_TEMPLATE,
};

/** The campaign's hand-built maps by id, or a generated operation site (`site-<biome>-<seed>`). */
export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES[id] ?? parseSiteTemplate(id);
}
