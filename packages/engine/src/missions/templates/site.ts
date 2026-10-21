import { generateSite, SITE_BIOMES, SITE_GENERATOR_VERSION, type SiteBiome, siteTemplateId } from '../../levelgen/site';
import type { TemplateDef } from '../spec';

const cache = new Map<string, TemplateDef>();
const CACHE_LIMIT = 32;

/**
 * The template of a generated operation site: a whole map laid out from the seed (see
 * generateSite). Its id, `site-<biome>-<seed>`, is all a mission spec needs to rebuild it.
 */
export function siteTemplate(biome: SiteBiome, seed: number): TemplateDef {
  const id = siteTemplateId(biome, seed);
  const cached = cache.get(id);
  if (cached) return cached;
  // The layout comes from a full generation without the (slower) light bake.
  const { layout } = generateSite({ biome, seed, bake: false });
  const template: TemplateDef = {
    id,
    name: layout.name,
    theme: biome,
    version: SITE_GENERATOR_VERSION,
    description: layout.description,
    sectors: layout.sectors,
    generate: (_seed, levelId) => generateSite({ biome, seed, id: levelId }).level,
    guards: layout.guards,
    reinforcements: layout.reinforcements,
    extractionZoneId: 'extraction',
    holdingZoneId: 'holding',
    defaults: layout.defaults,
    slots: layout.slots,
  };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(id, template);
  return template;
}

const SITE_ID = new RegExp(`^site-(${SITE_BIOMES.join('|')})-(\\d{1,10})$`);

/** The site template an id names, or undefined for any other id. */
export function parseSiteTemplate(id: string): TemplateDef | undefined {
  const match = SITE_ID.exec(id);
  if (!match) return undefined;
  const seed = Number(match[2]);
  return seed <= 0xffffffff ? siteTemplate(match[1] as SiteBiome, seed) : undefined;
}
