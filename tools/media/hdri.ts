// Fetches the CC0 sky HDRIs used for image-based lighting on the "rich environment" setting from
// Poly Haven (1k .hdr, MD5-verified) and writes a manifest with the source and authors.
//
//   make hdri
//
// Poly Haven assets are CC0 1.0 (public domain); see https://polyhaven.com/license.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Time of day → Poly Haven HDRI id. */
const SKIES: Record<string, string> = {
  night: 'dikhololo_night',
  dusk: 'belfast_sunset_puresky',
  day: 'bloem_hill_01',
};

const OUT_DIR = path.resolve('apps/web/public/media/hdri');
const force = process.argv.includes('--force');

interface FileEntry {
  url: string;
  md5: string;
  size: number;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const skies: Record<string, unknown> = {};
  for (const [key, id] of Object.entries(SKIES)) {
    const file = path.join(OUT_DIR, `${key}.hdr`);
    const [files, info] = await Promise.all([
      json<{ hdri: Record<string, { hdr: FileEntry }> }>(`https://api.polyhaven.com/files/${id}`),
      json<{ name: string; authors: Record<string, string> }>(`https://api.polyhaven.com/info/${id}`),
    ]);
    const entry = files.hdri['1k']?.hdr;
    if (!entry) throw new Error(`${id}: no 1k HDR`);
    if (force || !existsSync(file)) {
      const res = await fetch(entry.url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`${entry.url}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (createHash('md5').update(buf).digest('hex') !== entry.md5) throw new Error(`${entry.url}: checksum mismatch`);
      await fs.writeFile(file, buf);
      console.log(`ok   ${key} ← ${id} (${info.name})`);
    } else console.log(`skip ${key}`);
    skies[key] = { source: 'Poly Haven', id, name: info.name, url: `https://polyhaven.com/a/${id}`, authors: Object.keys(info.authors), license: 'CC0-1.0', file: `${key}.hdr` };
  }
  await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify({ version: 1, skies }, null, 2)}\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
