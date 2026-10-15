#!/usr/bin/env node
// Generates the Operation Shadow pre-production samples (concept images, music, voiced dialogue)
// through the Gemini Interactions API and builds samples/index.html for review.
//
// Run from the repo root (no host Node needed):
//   docker run --rm --env-file .env -v "$PWD":/work -w /work node:24-bookworm-slim \
//     node tools/samples/generate-samples.mjs [--only=id,id] [--force] [--verbose] [--concurrency=3] [--gallery-only]
//
// GOOGLE_API_KEY is read from the environment and never printed. Existing outputs are reused
// unless --force is given, so re-runs only pay for what is missing.

import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CHARACTERS,
  DIALOG_SCHEMA,
  IMAGE_JOBS,
  MODELS,
  MUSIC_JOBS,
  PRICES,
  SCENES,
  SQUAD,
  dialogPrompt,
} from './sample-spec.mjs';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OUT_DIR = path.resolve('samples');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');
const SCRIPT_PATH = path.join(OUT_DIR, 'dialog', 'script.json');
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const args = parseArgs(process.argv.slice(2));
const apiKey = (process.env.GOOGLE_API_KEY ?? '').trim().replace(/^['"]|['"]$/g, '');

function parseArgs(argv) {
  const opts = { only: null, force: false, verbose: false, concurrency: 3, galleryOnly: false };
  for (const a of argv) {
    if (a === '--force') opts.force = true;
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--gallery-only') opts.galleryOnly = true;
    else if (a.startsWith('--only=')) opts.only = new Set(a.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    else if (a.startsWith('--concurrency=')) opts.concurrency = Math.max(1, Number(a.slice(14)) || 3);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

const wanted = (id) => !args.only || args.only.has(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (text) => (apiKey ? String(text).split(apiKey).join('[REDACTED]') : String(text));
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts.map(redact));

// ---------------------------------------------------------------------------
// API access
// ---------------------------------------------------------------------------

async function interact(body, { label, timeoutMs }) {
  let payload = body;
  for (let attempt = 1; ; attempt += 1) {
    const started = Date.now();
    let res;
    try {
      res = await fetch(`${API_BASE}/interactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (attempt <= 2) {
        log(`${label}: ${err.name} (${err.message}), retrying`);
        await sleep(5000 * attempt);
        continue;
      }
      throw new Error(`request failed: ${err.message}`);
    }
    const raw = await res.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      // non-JSON body; handled below
    }
    if (res.ok) {
      if (args.verbose) log(`${label}: response skeleton ${JSON.stringify(skeleton(json))}`);
      return { json, elapsedMs: Date.now() - started };
    }
    const message = json?.error?.message ?? raw.slice(0, 400);
    if ('store' in payload && /\bstore\b/i.test(message)) {
      log(`${label}: retrying without store=false (${message})`);
      const { store: _store, ...rest } = payload;
      payload = rest;
      attempt -= 1;
      continue;
    }
    if (RETRYABLE.has(res.status) && attempt <= 2) {
      log(`${label}: HTTP ${res.status}, retrying in ${10 * attempt}s: ${message}`);
      await sleep(10000 * attempt);
      continue;
    }
    const err = new Error(`HTTP ${res.status}: ${message}`);
    err.status = res.status;
    throw err;
  }
}

// Structure of a response with long strings (base64 media, prose) elided, for --verbose.
function skeleton(node, depth = 0) {
  if (depth > 7) return '…';
  if (Array.isArray(node)) return node.slice(0, 4).map((n) => skeleton(n, depth + 1));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, skeleton(v, depth + 1)]));
  }
  if (typeof node === 'string') return node.length > 60 ? `<string ${node.length}>` : node;
  return node;
}

// Content blocks of an Interactions response, excluding thoughts and echoed user input.
function extractBlocks(root) {
  const blocks = [];
  const walk = (node, step) => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n, step);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const isStep = typeof node.type === 'string' && (Array.isArray(node.content) || Array.isArray(node.summary));
    const current = isStep ? node.type : step;
    if ((node.type === 'image' || node.type === 'audio') && typeof node.data === 'string') {
      blocks.push({ kind: node.type, data: node.data, mime: node.mime_type ?? node.mimeType ?? null, step: current });
      return;
    }
    if (node.type === 'text' && typeof node.text === 'string') blocks.push({ kind: 'text', text: node.text, step: current });
    for (const [key, value] of Object.entries(node)) {
      if (key === 'data') continue;
      const output = /^output_(image|audio)$/.exec(key);
      if (output && typeof value?.data === 'string') {
        blocks.push({ kind: output[1], data: value.data, mime: value.mime_type ?? value.mimeType ?? null, step: 'output' });
        continue;
      }
      walk(value, current);
    }
  };
  walk(root, null);
  return blocks.filter((b) => !/thought|user_input/i.test(b.step ?? ''));
}

const textOf = (blocks) =>
  blocks
    .filter((b) => b.kind === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

function usageOf(json) {
  const usage = json?.usage ?? json?.usage_metadata ?? json?.usageMetadata ?? null;
  if (!usage || typeof usage !== 'object') return null;
  return Object.fromEntries(Object.entries(usage).filter(([, v]) => typeof v === 'number'));
}

// ---------------------------------------------------------------------------
// Media files
// ---------------------------------------------------------------------------

function sniffExt(buf, kind) {
  const ascii = (start, end) => buf.toString('ascii', start, end);
  if (buf[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 4) === 'fLaC') return 'flac';
  return kind === 'image' ? 'png' : 'bin';
}

function pcmToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function wavDurationSec(buf) {
  let byteRate = 0;
  for (let offset = 12; offset + 8 <= buf.length; ) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(offset + 16);
    if (id === 'data') return byteRate ? Math.round((Math.min(size, buf.length - offset - 8) / byteRate) * 10) / 10 : null;
    offset += 8 + size + (size % 2);
  }
  return null;
}

async function writeMedia(id, subdir, block) {
  let buf = Buffer.from(block.data, 'base64');
  let ext = sniffExt(buf, block.kind);
  if (ext === 'bin' && /l16|pcm/i.test(block.mime ?? '')) {
    const rate = Number(/rate=(\d+)/i.exec(block.mime)?.[1] ?? 24000);
    buf = pcmToWav(buf, rate);
    ext = 'wav';
  }
  const dir = path.join(OUT_DIR, subdir);
  await fs.mkdir(dir, { recursive: true });
  for (const stale of await existingFiles(id, subdir)) await fs.rm(path.join(OUT_DIR, stale));
  const rel = `${subdir}/${id}.${ext}`;
  await fs.writeFile(path.join(OUT_DIR, rel), buf);
  return { file: rel, bytes: buf.length, mime: block.mime, durationSec: ext === 'wav' ? wavDurationSec(buf) : null };
}

async function existingFiles(id, subdir) {
  const dir = path.join(OUT_DIR, subdir);
  if (!existsSync(dir)) return [];
  return (await fs.readdir(dir)).filter((f) => f.startsWith(`${id}.`)).map((f) => `${subdir}/${f}`);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

async function runImage(job) {
  const body = {
    model: MODELS.image,
    input: [{ type: 'text', text: job.prompt }],
    response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: job.aspect, image_size: job.size },
    store: false,
  };
  const { json, elapsedMs } = await interact(body, { label: job.id, timeoutMs: 300_000 });
  const blocks = extractBlocks(json);
  const image = blocks.filter((b) => b.kind === 'image').at(-1);
  if (!image) throw new Error(`no image in response${textOf(blocks) ? `: ${textOf(blocks).slice(0, 300)}` : ''}`);
  const media = await writeMedia(job.id, 'images', image);
  return { ...media, usage: usageOf(json), elapsedMs, modelText: textOf(blocks).slice(0, 600) || undefined };
}

async function runMusic(job) {
  const body = { model: job.model, input: job.prompt, response_format: { type: 'audio' }, store: false };
  const { json, elapsedMs } = await interact(body, { label: job.id, timeoutMs: 540_000 });
  const blocks = extractBlocks(json);
  const audio = blocks.filter((b) => b.kind === 'audio').at(-1);
  if (!audio) throw new Error(`no audio in response${textOf(blocks) ? `: ${textOf(blocks).slice(0, 300)}` : ''}`);
  const media = await writeMedia(job.id, 'music', audio);
  return { ...media, usage: usageOf(json), elapsedMs, modelText: textOf(blocks).slice(0, 2000) || undefined };
}

function parseJsonText(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(stripped);
}

const clean = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“”']+|["“”']+$/g, '');

function validateScript(parsed) {
  const errors = [];
  const byId = new Map((Array.isArray(parsed?.scenes) ? parsed.scenes : []).map((s) => [s?.id, s]));
  const scenes = [];
  for (const def of SCENES) {
    const scene = byId.get(def.id);
    if (!scene || !Array.isArray(scene.lines)) {
      errors.push(`scene "${def.id}" is missing`);
      continue;
    }
    const lines = scene.lines.map((line, i) => {
      const where = `${def.id}[${i}]`;
      const speaker = String(line?.speaker ?? '');
      const text = clean(line?.text);
      if (!def.speakers.includes(speaker)) errors.push(`${where}: speaker "${speaker}" not allowed here (allowed: ${def.speakers.join(', ')})`);
      if (!text) errors.push(`${where}: empty text`);
      if (text.length > 220) errors.push(`${where}: text is longer than 220 characters`);
      if (/[<>*#`]|https?:|www\./i.test(text)) errors.push(`${where}: text contains markup or a URL`);
      if (def.id === 'barks' && text.split(/\s+/).length > 12) errors.push(`${where}: bark is longer than 12 words`);
      return { speaker, style: clean(line?.style).slice(0, 120), text };
    });
    if (def.id === 'barks') {
      for (const id of SQUAD) {
        const count = lines.filter((l) => l.speaker === id).length;
        if (count !== 4) errors.push(`barks: ${id} has ${count} lines, expected 4`);
      }
    }
    scenes.push({ id: def.id, title: clean(scene.title) || def.title, speakers: def.speakers, lines });
  }
  return { script: { scenes }, errors };
}

async function generateScript() {
  const structured = { type: 'text', mime_type: 'application/json', schema: DIALOG_SCHEMA };
  const request = async (input) => {
    try {
      return await interact({ model: MODELS.text, input, response_format: structured, store: false }, { label: 'dialog_script', timeoutMs: 180_000 });
    } catch (err) {
      if (err.status !== 400) throw err;
      log(`dialog_script: structured output rejected (${err.message}); retrying with plain JSON instructions`);
      return interact(
        { model: MODELS.text, input: `${input}\nReturn ONLY the JSON object, with no code fences.`, store: false },
        { label: 'dialog_script', timeoutMs: 180_000 },
      );
    }
  };
  const started = Date.now();
  const usages = [];
  let result = await request(dialogPrompt());
  usages.push(usageOf(result.json));
  let parsed = parseJsonText(textOf(extractBlocks(result.json)));
  let { script, errors } = validateScript(parsed);
  if (errors.length) {
    log(`dialog_script: ${errors.length} validation problem(s); requesting one repair`);
    result = await request(
      `${dialogPrompt()}\n\nYour previous answer was:\n${JSON.stringify(parsed)}\n\nFix these problems and return the complete corrected JSON:\n- ${errors.join('\n- ')}`,
    );
    usages.push(usageOf(result.json));
    const rawText = textOf(extractBlocks(result.json));
    parsed = parseJsonText(rawText);
    ({ script, errors } = validateScript(parsed));
    if (errors.length) {
      await fs.mkdir(path.dirname(SCRIPT_PATH), { recursive: true });
      await fs.writeFile(path.join(path.dirname(SCRIPT_PATH), 'script.rejected.json'), rawText);
      throw new Error(`script still invalid after one repair (saved dialog/script.rejected.json): ${errors.slice(0, 6).join('; ')}`);
    }
  }
  const record = { model: MODELS.text, generatedAt: new Date().toISOString(), repaired: usages.length > 1, ...script };
  await fs.mkdir(path.dirname(SCRIPT_PATH), { recursive: true });
  await fs.writeFile(SCRIPT_PATH, `${JSON.stringify(record, null, 2)}\n`);
  return { file: 'dialog/script.json', usage: usages, elapsedMs: Date.now() - started, script: record };
}

function ttsJobsFor(script) {
  const jobs = [];
  for (const scene of script.scenes) {
    if (scene.id === 'barks') {
      for (const id of SQUAD) {
        jobs.push({
          id: `dialog_barks_${id.toLowerCase()}`,
          title: `${id} — ${CHARACTERS[id].role}`,
          scene: scene.id,
          speakers: [id],
          lines: scene.lines.filter((l) => l.speaker === id),
        });
      }
    } else {
      jobs.push({ id: `dialog_${scene.id}`, title: scene.title, scene: scene.id, speakers: scene.speakers, lines: scene.lines });
    }
  }
  return jobs;
}

function ttsBody(job, joined) {
  const multi = job.speakers.length > 1;
  const gap = job.scene === 'barks' ? ' <long pause>' : '';
  const turns = job.lines.map((line, i) => ({
    type: 'text',
    text: i < job.lines.length - 1 ? `${line.text}${gap}` : line.text,
    annotations: [
      {
        type: 'speech_metadata',
        ...(multi ? { speaker: line.speaker } : {}),
        style: `${CHARACTERS[line.speaker].ttsStyle}; ${line.style}`.slice(0, 200),
      },
    ],
  }));
  const content =
    joined && !multi
      ? [
          {
            type: 'text',
            text: job.lines.map((l) => l.text).join(' <long pause> '),
            annotations: [{ type: 'speech_metadata', style: CHARACTERS[job.speakers[0]].ttsStyle }],
          },
        ]
      : turns;
  return {
    model: MODELS.tts,
    input: [{ type: 'user_input', content }],
    response_format: { type: 'audio' },
    generation_config: {
      speech_config: multi
        ? { mode: 'conversational', speakers: job.speakers.map((s) => ({ speaker: s, voice: CHARACTERS[s].voice })) }
        : [{ voice: CHARACTERS[job.speakers[0]].voice }],
    },
    store: false,
  };
}

async function runTts(job) {
  let result;
  try {
    result = await interact(ttsBody(job, false), { label: job.id, timeoutMs: 300_000 });
  } catch (err) {
    if (err.status !== 400 || job.speakers.length > 1) throw err;
    log(`${job.id}: per-line turns rejected (${err.message}); retrying as one passage`);
    result = await interact(ttsBody(job, true), { label: job.id, timeoutMs: 300_000 });
  }
  const audio = extractBlocks(result.json).filter((b) => b.kind === 'audio').at(-1);
  if (!audio) throw new Error('no audio in response');
  const media = await writeMedia(job.id, 'dialog', audio);
  return { ...media, usage: usageOf(result.json), elapsedMs: result.elapsedMs };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function saveManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function tracked(manifest, meta, subdir, run) {
  const existing = await existingFiles(meta.id, subdir);
  if (existing.length && !args.force && manifest.items[meta.id]?.status === 'ok') {
    log(`${meta.id}: already generated, skipping`);
    return;
  }
  log(`${meta.id}: generating with ${meta.model}`);
  try {
    const result = await run();
    manifest.items[meta.id] = { ...meta, status: 'ok', ...result, createdAt: new Date().toISOString() };
    log(`${meta.id}: ok (${result.file}, ${Math.round((result.bytes ?? 0) / 1024)} KB, ${Math.round(result.elapsedMs / 1000)}s)`);
  } catch (err) {
    manifest.items[meta.id] = { ...meta, status: 'error', error: redact(err.message), createdAt: new Date().toISOString() };
    log(`${meta.id}: FAILED: ${err.message}`);
  }
  await saveManifest(manifest);
}

async function pool(tasks, size) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
}

async function main() {
  if (!args.galleryOnly && !apiKey) throw new Error('GOOGLE_API_KEY is not set');
  await fs.mkdir(OUT_DIR, { recursive: true });
  const manifest = await loadJson(MANIFEST_PATH, { createdAt: new Date().toISOString(), items: {} });
  manifest.models = MODELS;

  if (!args.galleryOnly) {
    const dialogWanted = !args.only || [...args.only].some((id) => id.startsWith('dialog_'));
    let script = await loadJson(SCRIPT_PATH, null);
    if (dialogWanted && (!script || (args.force && wanted('dialog_script')))) {
      const meta = { id: 'dialog_script', type: 'dialog-script', title: 'Dialogue script', model: MODELS.text, prompt: dialogPrompt() };
      log('dialog_script: generating with', MODELS.text);
      try {
        const { script: generated, ...result } = await generateScript();
        script = generated;
        manifest.items[meta.id] = { ...meta, status: 'ok', ...result, createdAt: new Date().toISOString() };
        log(`dialog_script: ok (${script.scenes.reduce((n, s) => n + s.lines.length, 0)} lines)`);
      } catch (err) {
        manifest.items[meta.id] = { ...meta, status: 'error', error: redact(err.message), createdAt: new Date().toISOString() };
        log(`dialog_script: FAILED: ${err.message}`);
      }
      await saveManifest(manifest);
    }

    const tasks = [];
    for (const job of IMAGE_JOBS) {
      if (!wanted(job.id)) continue;
      const meta = { id: job.id, type: 'image', group: job.group, title: job.title, model: MODELS.image, prompt: job.prompt, settings: { aspect: job.aspect, size: job.size } };
      tasks.push(() => tracked(manifest, meta, 'images', () => runImage(job)));
    }
    for (const job of MUSIC_JOBS) {
      if (!wanted(job.id)) continue;
      const meta = { id: job.id, type: 'music', title: job.title, model: job.model, prompt: job.prompt };
      tasks.push(() => tracked(manifest, meta, 'music', () => runMusic(job)));
    }
    if (script) {
      for (const job of ttsJobsFor(script)) {
        if (!wanted(job.id) && !(args.only?.has('dialog_all'))) continue;
        const voices = Object.fromEntries(job.speakers.map((s) => [s, CHARACTERS[s].voice]));
        const meta = { id: job.id, type: 'dialog', scene: job.scene, title: job.title, model: MODELS.tts, settings: { voices }, lines: job.lines };
        tasks.push(() => tracked(manifest, meta, 'dialog', () => runTts(job)));
      }
    }
    await pool(tasks, args.concurrency);
  }

  await saveManifest(manifest);
  await buildGallery(manifest, await loadJson(SCRIPT_PATH, null));
  const items = Object.values(manifest.items);
  const failed = items.filter((i) => i.status === 'error');
  log(`done: ${items.length - failed.length} ok, ${failed.length} failed; estimated cost ${formatUsd(totalCost(items))}`);
  for (const f of failed) log(`  failed ${f.id}: ${f.error}`);
}

// ---------------------------------------------------------------------------
// Cost estimate
// ---------------------------------------------------------------------------

function tokens(usage, keys) {
  for (const k of keys) if (typeof usage?.[k] === 'number') return usage[k];
  return 0;
}

function costOf(item) {
  if (item.status !== 'ok') return 0;
  if (item.type === 'image') return PRICES.imageBySize[item.settings?.size] ?? 0;
  if (item.type === 'music') return item.model === MODELS.song ? PRICES.song : 0;
  const usages = Array.isArray(item.usage) ? item.usage : [item.usage];
  const [pin, pout] = item.type === 'dialog' ? [PRICES.ttsPerMTokIn, PRICES.ttsPerMTokOut] : [PRICES.textPerMTokIn, PRICES.textPerMTokOut];
  return usages.reduce((sum, u) => {
    const input = tokens(u, ['total_input_tokens', 'input_tokens', 'prompt_tokens', 'prompt_token_count', 'promptTokenCount']);
    const output =
      tokens(u, ['total_output_tokens', 'output_tokens', 'candidates_token_count', 'candidatesTokenCount']) +
      tokens(u, ['total_thought_tokens', 'thought_tokens', 'thoughts_token_count', 'thoughtsTokenCount']);
    return sum + (input * pin + output * pout) / 1e6;
  }, 0);
}

const totalCost = (items) => items.reduce((sum, i) => sum + costOf(i), 0);
const formatUsd = (n) => `$${n.toFixed(2)}`;

// ---------------------------------------------------------------------------
// Review gallery
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function audioTag(item) {
  return `<audio controls preload="none" src="${esc(item.file)}"></audio>`;
}

function promptDetails(text, label = 'Prompt') {
  return text ? `<details><summary>${esc(label)}</summary><pre>${esc(text)}</pre></details>` : '';
}

function transcript(lines) {
  return `<ol class="lines">${lines
    .map(
      (l) =>
        `<li><span class="who who-${esc(l.speaker.toLowerCase())}">${esc(l.speaker)}</span><span class="style">${esc(l.style)}</span><span class="text">${esc(l.text)}</span></li>`,
    )
    .join('')}</ol>`;
}

async function buildGallery(manifest, script) {
  const items = Object.values(manifest.items ?? {});
  const okItems = items.filter((i) => i.status === 'ok');
  const failed = items.filter((i) => i.status === 'error');

  const imageGroups = [...new Set(IMAGE_JOBS.map((j) => j.group))]
    .map((group) => {
      const cards = IMAGE_JOBS.filter((j) => j.group === group)
        .map((j) => manifest.items[j.id])
        .filter((i) => i?.status === 'ok')
        .map(
          (i) => `<figure class="card ${i.settings?.aspect === '1:1' ? 'square' : ''}">
  <a href="${esc(i.file)}" target="_blank" rel="noopener"><img src="${esc(i.file)}" alt="${esc(i.title)}" loading="lazy"></a>
  <figcaption><strong>${esc(i.title)}</strong><span class="meta">${esc(i.model)} · ${esc(i.settings?.aspect)} · ${esc(i.settings?.size)}</span>${promptDetails(i.prompt)}</figcaption>
</figure>`,
        )
        .join('\n');
      return cards ? `<h3>${esc(group)}</h3><div class="grid ${group === 'Squad portraits' ? 'portraits' : ''}">${cards}</div>` : '';
    })
    .join('\n');

  const music = MUSIC_JOBS.map((j) => manifest.items[j.id])
    .filter((i) => i?.status === 'ok')
    .map(
      (i) => `<div class="card pad"><strong>${esc(i.title)}</strong><span class="meta">${esc(i.model)}</span>${audioTag(i)}${promptDetails(i.prompt)}${promptDetails(i.modelText, 'Structure notes returned by the model')}</div>`,
    )
    .join('\n');

  const casting = Object.entries(CHARACTERS)
    .map(([id, c]) => `<tr><td><span class="who who-${esc(id.toLowerCase())}">${esc(id)}</span></td><td>${esc(c.name)}</td><td>${esc(c.role)}</td><td>${esc(c.voice)}</td><td>${esc(c.persona)}</td></tr>`)
    .join('');

  const dialog = (script?.scenes ?? [])
    .map((scene) => {
      if (scene.id === 'barks') {
        const rows = SQUAD.map((id) => {
          const item = manifest.items[`dialog_barks_${id.toLowerCase()}`];
          const lines = scene.lines.filter((l) => l.speaker === id);
          return `<div class="card pad"><strong>${esc(id)} — ${esc(CHARACTERS[id].name)}</strong><span class="meta">${esc(CHARACTERS[id].role)} · voice ${esc(CHARACTERS[id].voice)}</span>${item?.status === 'ok' ? audioTag(item) : '<p class="warn">Audio not generated</p>'}${transcript(lines)}</div>`;
        }).join('');
        return `<h3>${esc(scene.title)}</h3><div class="grid barks">${rows}</div>`;
      }
      const item = manifest.items[`dialog_${scene.id}`];
      const voices = scene.speakers.map((s) => `${s}: ${CHARACTERS[s].voice}`).join(' · ');
      return `<h3>${esc(scene.title)}</h3><div class="card pad"><span class="meta">${esc(voices)}</span>${item?.status === 'ok' ? audioTag(item) : '<p class="warn">Audio not generated</p>'}${transcript(scene.lines)}</div>`;
    })
    .join('\n');

  const failures = failed.length
    ? `<section><h2>Failed items</h2><ul>${failed.map((f) => `<li><code>${esc(f.id)}</code>: ${esc(f.error)}</li>`).join('')}</ul></section>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Operation Shadow — Samples</title>
<style>
  :root { --bg:#111519; --panel:#1a2026; --ink:#e6e1d6; --muted:#9aa3a8; --line:#2b333a; --accent:#c9a45c; --warn:#e07a5f; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; }
  header, main { max-width: 1280px; margin: 0 auto; padding: 24px 16px; }
  header h1 { font-family: "Courier New", monospace; letter-spacing: .08em; margin: 0 0 4px; color: var(--accent); }
  h2 { border-bottom: 1px solid var(--line); padding-bottom: 6px; margin-top: 40px; }
  h3 { color: var(--accent); font-weight: 600; margin: 28px 0 12px; }
  .note { background: var(--panel); border-left: 3px solid var(--accent); padding: 12px 16px; color: var(--muted); }
  .note li { margin: 4px 0; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); }
  .grid.portraits { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
  .grid.barks { grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; margin: 0; }
  .card.pad { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
  .card img { display:block; width:100%; height:auto; background:#000; }
  figcaption { padding: 10px 12px; display:flex; flex-direction:column; gap:4px; }
  .meta { color: var(--muted); font-size: 12px; }
  details summary { cursor: pointer; color: var(--muted); font-size: 12px; }
  pre { white-space: pre-wrap; font-size: 12px; color: var(--muted); margin: 6px 0 0; }
  audio { width: 100%; }
  .lines { list-style: none; padding: 0; margin: 4px 0 0; display:flex; flex-direction:column; gap:8px; }
  .lines li { display:grid; grid-template-columns: 84px 1fr; gap: 2px 10px; }
  .lines .style { color: var(--muted); font-style: italic; font-size: 12px; grid-column: 2; }
  .lines .text { grid-column: 2; }
  .lines .who { grid-row: span 2; }
  .who { font: 700 11px/1.8 "Courier New", monospace; letter-spacing:.06em; padding: 0 6px; border-radius: 3px; background:#2b333a; height: fit-content; text-align:center; }
  .who-lantern { background:#5c4a1f; } .who-moth { background:#3a3f55; } .who-owl { background:#2f4f4a; }
  .who-badger { background:#5a3b2a; } .who-fox { background:#5b2f3c; } .who-heron { background:#2f4a5c; }
  .who-otter { background:#24505a; } .who-guard_a, .who-guard_b { background:#4a2323; }
  table { width:100%; border-collapse: collapse; font-size: 13px; }
  td { border-bottom: 1px solid var(--line); padding: 6px 8px; vertical-align: top; }
  .warn { color: var(--warn); }
  footer { color: var(--muted); font-size: 12px; max-width:1280px; margin:0 auto; padding: 24px 16px 48px; }
</style>
</head>
<body>
<header>
  <h1>OPERATION SHADOW</h1>
  <div>Pre-production samples for art, music and dialogue direction. Please review and approve or request changes.</div>
  <ul class="note">
    <li>Generated on ${esc((manifest.updatedAt ?? '').slice(0, 10))} with Google models: ${esc(Object.values(MODELS).join(', '))}. Every output carries Google's invisible SynthID watermark.</li>
    <li><strong>Concept images show the target mood, palette and composition.</strong> The playable game renders a real-time 3D world from procedural and CC0 assets, so in-engine visuals will be simpler than these paintings.</li>
    <li>Dialogue lines were written by ${esc(MODELS.text)} from the cast and mission brief below, then voiced with prebuilt Gemini voices. Radio filtering, 3D positioning and mixing are added by the game's audio engine and are not applied here.</li>
    <li>All names, factions and characters are original placeholders and can be changed.</li>
  </ul>
</header>
<main>
  <section><h2>Images</h2>${imageGroups || '<p class="warn">No images were generated.</p>'}</section>
  <section><h2>Soundtrack</h2><div class="grid">${music || '<p class="warn">No music was generated.</p>'}</div></section>
  <section><h2>Dialogue</h2>
    <h3>Cast and voices</h3><div class="card pad"><table>${casting}</table></div>
    ${dialog || '<p class="warn">No dialogue was generated.</p>'}
  </section>
  ${failures}
</main>
<footer>${okItems.length} items · estimated API cost ${esc(formatUsd(totalCost(items)))} (published prices; the Lyria 3 Clip price is not published and is excluded) · manifest: manifest.json</footer>
</body>
</html>
`;
  await fs.writeFile(path.join(OUT_DIR, 'index.html'), html);
}

main().catch((err) => {
  console.error(redact(err.stack ?? err.message));
  process.exit(1);
});
