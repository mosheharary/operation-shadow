import { describe, expect, it } from 'vitest';
import { compileAndValidate, fallbackSpec } from '../missions/compile';
import { getTemplate } from '../missions/templates/index';
import { siteTemplate } from '../missions/templates/site';
import { levelHash } from './hash';
import { generateSite, SITE_BIOMES, siteTemplateId } from './site';

describe('generated operation sites', () => {
  it.each(SITE_BIOMES)('%s sites build valid, winnable missions across seeds', (biome) => {
    // SITE_SEEDS=200 for a longer soak.
    for (let seed = 1; seed <= Number(process.env.SITE_SEEDS ?? 12); seed += 1) {
      const s = seed * 7919 + biome.length;
      const template = siteTemplate(biome, s);
      const spec = fallbackSpec(template, s, `op-${biome}-${seed}`);
      const { report, mission } = compileAndValidate(spec, template);
      expect(report.issues.filter((i) => i.severity === 'error'), `${biome} seed ${s}`).toEqual([]);
      expect(report.ok).toBe(true);
      expect(mission.guards.length).toBeGreaterThan(4);
      for (const tag of ['objective-target', 'item', 'prisoner']) expect(template.slots.some((slot) => slot.tag === tag), `${biome} ${tag}`).toBe(true);
      // Labels fit in 60-character titles: "Disable the <label>", "Free the prisoner held at the <label>".
      for (const slot of template.slots) expect(slot.label.length, slot.label).toBeLessThanOrEqual(slot.tag === 'objective-target' ? 48 : 30);
    }
  }, 600_000);

  it('every seed gives a different map, and the same seed the same map', () => {
    const hashes = new Set<string>();
    const names = new Set<string>();
    for (const biome of SITE_BIOMES) {
      for (let seed = 1; seed <= 4; seed += 1) {
        const { level, layout } = generateSite({ biome, seed: seed * 104729, bake: false });
        hashes.add(levelHash(level));
        names.add(layout.name);
        const layoutKey = layout.slots.map((s) => s.id).join();
        expect(layoutKey.length).toBeGreaterThan(0);
      }
    }
    expect(hashes.size).toBe(SITE_BIOMES.length * 4);
    expect(names.size).toBeGreaterThan(12);
    const a = generateSite({ biome: 'forest', seed: 42 });
    const b = generateSite({ biome: 'forest', seed: 42 });
    expect(levelHash(a.level)).toBe(levelHash(b.level));
  });

  it('sites are found by id, and other ids are not', () => {
    const id = siteTemplateId('rail', 1234);
    expect(getTemplate(id)?.theme).toBe('rail');
    expect(getTemplate(id)?.id).toBe(id);
    expect(getTemplate('site-moon-1')).toBeUndefined();
    expect(getTemplate('site-rail-99999999999')).toBeUndefined();
  });
});
