// Fetches the CC0 glTF models used by the renderer on the High preset, verifies them, cuts them
// down to the per-asset budgets (meshopt simplification, 512/256 px WebP textures; plain float
// vertex data, so no decoder is needed at runtime) and writes content-hashed GLBs plus a manifest
// with the source, authors, licence, size and triangle count of every model.
//
//   make models                          # fetch and build missing models
//   make models ARGS="--force"           # rebuild everything
//   make models ARGS="--inspect <id>"    # list a source's top-level nodes and triangles
//   make models ARGS="--from packs"      # folder with downloaded pack archives (Quaternius)
//
// Poly Haven and Quaternius assets are CC0 1.0 (public domain).

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type Document, NodeIO, type Node as GltfNode } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, join, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { MODELS, type ModelSpec, type PolyHavenSource } from './model-sources';

const OUT_DIR = path.resolve('apps/web/public/media/models');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const args = process.argv.slice(2);
const force = args.includes('--force');
const inspectId = args.includes('--inspect') ? args[args.indexOf('--inspect') + 1] : undefined;

interface FileEntry {
  url: string;
  md5: string;
  size: number;
  include?: Record<string, FileEntry>;
}

export interface ManifestEntry {
  file: string;
  bytes: number;
  triangles: number;
  /** Axis-aligned bounds of the processed scene (metres, glTF axes: +y up, model faces +z). */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  source: string;
  name: string;
  url: string;
  authors: string[];
  license: 'CC0-1.0';
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function download(entry: FileEntry): Promise<Buffer> {
  const res = await fetch(entry.url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`${entry.url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (createHash('md5').update(buf).digest('hex') !== entry.md5) throw new Error(`${entry.url}: checksum mismatch`);
  return buf;
}

/** Downloads a Poly Haven model (1k textures) into a fresh folder; returns the .gltf path and its credits. */
async function fetchPolyHaven(src: PolyHavenSource, tmp: string): Promise<{ file: string; name: string; url: string; authors: string[] }> {
  const [files, info] = await Promise.all([
    json<{ gltf: Record<string, { gltf: FileEntry }> }>(`https://api.polyhaven.com/files/${src.asset}`),
    json<{ name: string; authors: Record<string, string> }>(`https://api.polyhaven.com/info/${src.asset}`),
  ]);
  const entry = files.gltf['1k']?.gltf;
  if (!entry) throw new Error(`${src.asset}: no 1k glTF`);
  const dir = await fs.mkdtemp(path.join(tmp, `${src.asset}-`));
  const file = path.join(dir, `${src.asset}.gltf`);
  await fs.writeFile(file, await download(entry));
  for (const [rel, inc] of Object.entries(entry.include ?? {})) {
    const target = path.resolve(dir, rel);
    if (!target.startsWith(dir + path.sep)) throw new Error(`${src.asset}: unsafe path ${rel}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await download(inc));
  }
  return { file, name: info.name, url: `https://polyhaven.com/a/${src.asset}`, authors: Object.keys(info.authors) };
}

function triangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
      n += count / 3;
    }
  }
  return Math.round(n);
}

function topLevelNodes(doc: Document): GltfNode[] {
  return doc.getRoot().getDefaultScene()?.listChildren() ?? doc.getRoot().listScenes()[0]?.listChildren() ?? [];
}

function nodeTriangles(node: GltfNode): number {
  let n = 0;
  node.traverse((child) => {
    for (const prim of child.getMesh()?.listPrimitives() ?? []) n += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
  });
  return Math.round(n);
}

async function optimize(spec: ModelSpec, doc: Document): Promise<void> {
  if (spec.nodes) {
    const keep = new Set(spec.nodes);
    for (const node of topLevelNodes(doc)) if (!keep.has(node.getName())) node.dispose();
  }
  await doc.transform(dedup(), prune(), weld());
  if (!spec.skinned) await doc.transform(flatten(), join(), weld());
  // Simplify with a growing error tolerance until the model fits its triangle budget.
  for (let error = 0.002; !spec.skinned && triangles(doc) > spec.maxTriangles && error < 0.2; error *= 2) {
    await MeshoptSimplifier.ready;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: spec.maxTriangles / triangles(doc), error }));
  }
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [spec.textureSize, spec.textureSize], quality: 82 }),
    prune(),
  );
  if (triangles(doc) > spec.maxTriangles * 1.1) throw new Error(`${spec.id}: ${triangles(doc)} triangles, budget ${spec.maxTriangles}`);
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'models-'));
  const previous = existsSync(MANIFEST) ? (JSON.parse(await fs.readFile(MANIFEST, 'utf8')) as { models: Record<string, ManifestEntry> }) : { models: {} };
  const models: Record<string, ManifestEntry> = { ...previous.models };

  try {
    for (const spec of MODELS) {
      if (inspectId && spec.id !== inspectId) continue;
      const existing = models[spec.id];
      if (!inspectId && !force && existing && existsSync(path.join(OUT_DIR, existing.file))) {
        console.log(`skip ${spec.id}`);
        continue;
      }
      if (spec.source.kind !== 'polyhaven') throw new Error(`${spec.id}: pack sources need --from (not yet configured)`);
      const fetched = await fetchPolyHaven(spec.source, tmp);
      const doc = await io.read(fetched.file);
      if (inspectId) {
        for (const node of topLevelNodes(doc)) console.log(`${node.getName()}\t${nodeTriangles(node)} tris`);
        continue;
      }
      const before = triangles(doc);
      await optimize(spec, doc);
      const glb = Buffer.from(await io.writeBinary(doc));
      const hash = createHash('sha256').update(glb).digest('hex').slice(0, 8);
      const file = `${spec.group}/${spec.id.split('.').slice(1).join('.')}.${hash}.glb`;
      await fs.mkdir(path.join(OUT_DIR, spec.group), { recursive: true });
      if (existing && existing.file !== file) await fs.rm(path.join(OUT_DIR, existing.file), { force: true });
      await fs.writeFile(path.join(OUT_DIR, file), glb);
      const bounds = getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!);
      models[spec.id] = {
        file,
        bytes: glb.length,
        triangles: triangles(doc),
        bounds: { min: bounds.min as [number, number, number], max: bounds.max as [number, number, number] },
        source: 'Poly Haven',
        name: fetched.name,
        url: fetched.url,
        authors: fetched.authors,
        license: 'CC0-1.0',
      };
      console.log(`ok   ${spec.id} ← ${fetched.name}: ${before} → ${models[spec.id]!.triangles} tris, ${(glb.length / 1024).toFixed(0)} KB`);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
  if (inspectId) return;
  const sorted = Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(MANIFEST, `${JSON.stringify({ version: 1, models: sorted }, null, 2)}\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
