// Fetches the CC0 surface textures used by the renderer from Poly Haven, verifies them against
// the published MD5 sums, downsizes them to 512 px WebP and writes a manifest with the source,
// authors, licence and real-world tile size of every set.
//
//   make textures            # fetch missing sets
//   make textures ARGS="--force"
//
// Poly Haven assets are CC0 1.0 (public domain); see https://polyhaven.com/license.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Renderer surface key → Poly Haven asset id. Chosen to match the approved coastal concept art. */
const SETS: Record<string, string> = {
  cobble: 'cobblestone_01',
  rock: 'mossy_rock',
  grass: 'sparse_grass',
  forest: 'forest_ground_04',
  sand: 'coast_sand_01',
  gravel: 'gravel_floor',
  planks: 'dark_wooden_planks',
  'planks-light': 'brown_planks_09',
  plaster: 'worn_mossy_plasterwall',
  'stone-wall': 'old_stone_wall',
  'roof-slate': 'grey_roof_tiles',
  'roof-clay': 'clay_roof_tiles',
  concrete: 'chipped_concrete',
  metal: 'rusty_metal_02',
  snow: 'snow_02',
};

const MAPS = { color: 'Diffuse', normal: 'nor_gl', rough: 'Rough' } as const;
const SIZE = 512;
const OUT_DIR = path.resolve('apps/web/public/media/textures');
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

async function download(entry: FileEntry): Promise<Buffer> {
  const res = await fetch(entry.url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${entry.url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const md5 = createHash('md5').update(buf).digest('hex');
  if (md5 !== entry.md5) throw new Error(`${entry.url}: checksum mismatch`);
  return buf;
}

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'textures-'));
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const previous = existsSync(manifestPath) ? (JSON.parse(await fs.readFile(manifestPath, 'utf8')) as { sets: Record<string, unknown> }) : { sets: {} };
  const sets: Record<string, unknown> = { ...previous.sets };

  for (const [key, id] of Object.entries(SETS)) {
    const dir = path.join(OUT_DIR, key);
    if (!force && existsSync(path.join(dir, 'rough.webp')) && sets[key]) {
      console.log(`skip ${key} (${id})`);
      continue;
    }
    const [files, info] = await Promise.all([
      json<Record<string, Record<string, Record<string, FileEntry>>>>(`https://api.polyhaven.com/files/${id}`),
      json<{ name: string; authors: Record<string, string>; dimensions?: [number, number] }>(`https://api.polyhaven.com/info/${id}`),
    ]);
    await fs.mkdir(dir, { recursive: true });
    for (const [name, mapKey] of Object.entries(MAPS)) {
      const entry = files[mapKey]?.['1k']?.jpg;
      if (!entry) throw new Error(`${id}: no 1k ${mapKey} map`);
      const source = path.join(tmp, `${key}-${name}.jpg`);
      await fs.writeFile(source, await download(entry));
      const filter = name === 'rough' ? `scale=${SIZE}:${SIZE}:flags=lanczos,format=gray` : `scale=${SIZE}:${SIZE}:flags=lanczos`;
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', source, '-vf', filter, '-c:v', 'libwebp', '-quality', name === 'normal' ? '90' : '82', path.join(dir, `${name}.webp`)]);
    }
    const [w, h] = info.dimensions ?? [2000, 2000];
    sets[key] = {
      source: 'Poly Haven',
      id,
      name: info.name,
      url: `https://polyhaven.com/a/${id}`,
      authors: Object.keys(info.authors),
      license: 'CC0-1.0',
      tileMeters: [Math.round(w) / 1000, Math.round(h) / 1000],
      files: { color: `${key}/color.webp`, normal: `${key}/normal.webp`, rough: `${key}/rough.webp` },
    };
    console.log(`ok   ${key} ← ${id} (${info.name}, ${Object.keys(info.authors).join(', ')})`);
  }
  await fs.writeFile(manifestPath, `${JSON.stringify({ version: 1, size: SIZE, sets }, null, 2)}\n`);
  await fs.rm(tmp, { recursive: true, force: true });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
