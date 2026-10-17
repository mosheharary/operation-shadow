// Fetches the CC0 glTF models used by the renderer on the High preset, verifies them, cuts them
// down to the per-asset budgets (meshopt simplification, 512/256 px WebP textures; plain float
// vertex data, so no decoder is needed at runtime) and writes content-hashed GLBs plus a manifest
// with the source, authors, licence, size and triangle count of every model.
//
//   make models                          # fetch and build missing models
//   make models ARGS="--force"           # rebuild everything
//   make models ARGS="--inspect <id>"    # list a source's top-level nodes and triangles
//   make models PACKS=~/Downloads        # folder with the downloaded pack archives (Quaternius),
//                                        # mounted read-only and verified by SHA-256
//
// Poly Haven and Quaternius assets are CC0 1.0 (public domain).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type Document, NodeIO, type Node as GltfNode } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, join, prune, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { MODELS, type ModelSpec, type PackSource, type PolyHavenSource } from './model-sources';

const OUT_DIR = path.resolve('apps/web/public/media/models');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const args = process.argv.slice(2);
const force = args.includes('--force');
const inspectId = args.includes('--inspect') ? args[args.indexOf('--inspect') + 1] : undefined;
const fromDir = args.includes('--from') ? path.resolve(args[args.indexOf('--from') + 1]!) : undefined;

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
  /** Animation library only: clip length (s) and ground speed of the root-motion version (m/s). */
  clips?: Record<string, { duration: number; speed: number }>;
}

interface Fetched {
  file: string;
  name: string;
  url: string;
  authors: string[];
  source: string;
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
async function fetchPolyHaven(src: PolyHavenSource, tmp: string): Promise<Fetched> {
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
  return { file, name: info.name, url: `https://polyhaven.com/a/${src.asset}`, authors: Object.keys(info.authors), source: 'Poly Haven' };
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

const extracted = new Map<string, string>();

/** Verifies a downloaded pack archive and extracts it (once) into a fresh folder. */
async function extractPack(src: PackSource, tmp: string): Promise<string> {
  const cached = extracted.get(src.archive);
  if (cached) return cached;
  if (!fromDir) throw new Error(`${src.archive}: pass --from <folder with the downloaded archives>`);
  const archive = path.join(fromDir, src.archive);
  if (!existsSync(archive)) throw new Error(`${archive}: not found (download it from ${src.url})`);
  if ((await sha256(archive)) !== src.sha256) throw new Error(`${src.archive}: checksum mismatch`);
  const dir = await fs.mkdtemp(path.join(tmp, 'pack-'));
  execFileSync('unzip', ['-q', archive, '-d', dir]);
  extracted.set(src.archive, dir);
  return dir;
}

/** Finds a model inside an extracted pack; for .gltf files, rewrites the image URIs listed in `images`. */
async function fetchPack(src: PackSource, file: string, tmp: string): Promise<Fetched> {
  const dir = await extractPack(src, tmp);
  const target = path.resolve(dir, file);
  if (!target.startsWith(dir + path.sep) || !existsSync(target)) throw new Error(`${src.archive}: no ${file}`);
  let out = target;
  if (src.images && target.endsWith('.gltf')) {
    const json = JSON.parse(await fs.readFile(target, 'utf8')) as { images?: { uri?: string }[] };
    for (const image of json.images ?? []) {
      const replacement = image.uri && src.images[image.uri];
      if (replacement) image.uri = replacement;
    }
    out = target.replace(/\.gltf$/, '.patched.gltf');
    await fs.writeFile(out, JSON.stringify(json));
  }
  return { file: out, name: `${src.pack}: ${path.basename(file).replace(/\.(gltf|glb)$/, '')}`, url: src.url, authors: src.authors, source: 'Quaternius' };
}

/** Clip durations and the ground speed of each clip's root-motion version. */
function clipSpeeds(doc: Document, clips: Record<string, string>): Record<string, { duration: number; speed: number }> {
  const out: Record<string, { duration: number; speed: number }> = {};
  for (const anim of doc.getRoot().listAnimations()) {
    const name = clips[anim.getName()];
    if (!name) continue;
    let duration = 0;
    let speed = 0;
    for (const channel of anim.listChannels()) {
      const input = channel.getSampler()?.getInput()?.getArray();
      if (input) duration = Math.max(duration, input[input.length - 1]!);
      if (channel.getTargetNode()?.getName() !== 'root' || channel.getTargetPath() !== 'translation') continue;
      const values = channel.getSampler()!.getOutput()!.getArray()!;
      const n = values.length / 3;
      const dx = values[(n - 1) * 3]! - values[0]!;
      const dz = values[(n - 1) * 3 + 2]! - values[2]!;
      const span = input ? input[input.length - 1]! - input[0]! : 0;
      speed = span > 0 ? Math.hypot(dx, dz) / span : 0;
    }
    out[name] = { duration: Math.round(duration * 1000) / 1000, speed: Math.round(speed * 1000) / 1000 };
  }
  return out;
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
  if (spec.process === 'animations') {
    // Skeleton and the wanted clips only: drop the mannequin mesh and every other clip.
    const clips = spec.clips ?? {};
    for (const node of doc.getRoot().listNodes()) {
      node.setMesh(null);
      node.setSkin(null);
    }
    for (const skin of doc.getRoot().listSkins()) skin.dispose();
    for (const anim of doc.getRoot().listAnimations()) {
      const name = clips[anim.getName()];
      if (!name) {
        // Disposing a clip leaves its samplers (and their data) alive.
        for (const sampler of anim.listSamplers()) sampler.dispose();
        anim.dispose();
        continue;
      }
      anim.setName(name);
      // Finger tips are a few pixels at game distance: keep the knuckles, drop the finer joints.
      for (const channel of anim.listChannels()) {
        if (!/_0[234]_|_leaf/.test(channel.getTargetNode()?.getName() ?? '')) continue;
        channel.getSampler()?.dispose();
        channel.dispose();
      }
    }
    await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
    return;
  }
  const isStatic = (spec.process ?? 'static') === 'static';
  await doc.transform(dedup(), prune(), weld());
  if (isStatic) await doc.transform(flatten(), join(), weld());
  // Simplify with a growing error tolerance until the model fits its triangle budget.
  for (let error = 0.002; isStatic && triangles(doc) > spec.maxTriangles && error < 0.2; error *= 2) {
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
      const fetched = spec.source.kind === 'polyhaven' ? await fetchPolyHaven(spec.source, tmp) : await fetchPack(spec.source, spec.source.file, tmp);
      const doc = await io.read(fetched.file);
      let clips: ManifestEntry['clips'];
      if (spec.rootMotionFile && spec.source.kind === 'pack' && spec.clips) {
        clips = clipSpeeds(await io.read((await fetchPack(spec.source, spec.rootMotionFile, tmp)).file), spec.clips);
      }
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
      const box = getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!);
      const finite = box.min.every(Number.isFinite);
      const bounds = finite ? box : { min: [0, 0, 0], max: [0, 0, 0] };
      models[spec.id] = {
        file,
        bytes: glb.length,
        triangles: triangles(doc),
        bounds: { min: bounds.min as [number, number, number], max: bounds.max as [number, number, number] },
        source: fetched.source,
        name: fetched.name,
        url: fetched.url,
        authors: fetched.authors,
        license: 'CC0-1.0',
        ...(clips ? { clips } : {}),
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
