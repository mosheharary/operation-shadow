import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allModelIds, modelEntry } from './registry';

const PUBLIC = path.resolve(import.meta.dirname, '../../../public/media/models');

describe('model manifest', () => {
  it('lists only CC0 models whose files exist with the recorded size', () => {
    const ids = allModelIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const entry = modelEntry(id);
      expect(entry.license, id).toBe('CC0-1.0');
      const file = path.join(PUBLIC, entry.file);
      expect(existsSync(file), entry.file).toBe(true);
      expect(statSync(file).size, entry.file).toBe(entry.bytes);
    }
  });

  it('keeps every model within the download budget (15 MB in all, 2 MB each)', () => {
    const sizes = allModelIds().map((id) => modelEntry(id).bytes);
    for (const bytes of sizes) expect(bytes).toBeLessThan(2 * 1024 * 1024);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(15 * 1024 * 1024);
  });
});
