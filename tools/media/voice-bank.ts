// Generates the in-game voice bank: one short MP3 per dialogue line (squad barks, guard barks and
// HQ radio messages), voiced with the approved Gemini TTS voices, plus a manifest the game reads.
//
//   make voice-bank                     # generate what is missing or changed
//   make voice-bank ARGS="--dry-run"    # list the lines and the estimated cost, no API calls
//   make voice-bank ARGS="--force"      # regenerate everything
//
// GOOGLE_API_KEY comes from the environment and is never printed. Lines whose text, voice and
// style are unchanged since the last run are skipped, so re-runs only pay for what changed.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GUARD_BARKS, GUARD_VOICES, HQ_PROFILE, MISSIONS, SPECIALIST_PROFILES, SQUAD_BARKS } from '@operation-shadow/content';
import { SPECIALISTS } from '@operation-shadow/engine';

const MODEL = 'gemini-3.8-flash-tts';
const API = 'https://generativelanguage.googleapis.com/v1beta/interactions';
// Published TTS prices (USD per million tokens), for the cost estimate only.
const PRICE_IN = 0.5;
const PRICE_OUT = 9.0;
const OUT_DIR = path.resolve('apps/web/public/media/voice');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

interface Job {
  key: string;
  speaker: string;
  text: string;
  voice: string;
  style: string;
}

interface ManifestLine {
  file: string;
  seconds: number;
  voice: string;
  speaker: string;
  text: string;
  hash: string;
}

interface Manifest {
  version: 1;
  model: string;
  generatedAt: string;
  lines: Record<string, ManifestLine>;
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const concurrency = Number(args.find((a) => a.startsWith('--concurrency='))?.slice(14) ?? 4) || 4;
const apiKey = (process.env.GOOGLE_API_KEY ?? '').trim().replace(/^['"]|['"]$/g, '');
const redact = (text: string) => (apiKey ? text.split(apiKey).join('[REDACTED]') : text);
const log = (message: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${redact(message)}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function collectJobs(): Job[] {
  const jobs: Job[] = [];
  for (const role of SPECIALISTS) {
    const profile = SPECIALIST_PROFILES[role];
    for (const lines of Object.values(SQUAD_BARKS[role])) {
      for (const line of lines) jobs.push({ key: line.key, speaker: profile.callSign, text: line.text, voice: profile.voice, style: profile.voiceStyle });
    }
  }
  for (const lines of Object.values(GUARD_BARKS)) {
    for (const line of lines) {
      for (const [variant, v] of Object.entries(GUARD_VOICES)) {
        jobs.push({ key: `${line.key}-${variant}`, speaker: `guard-${variant}`, text: line.text, voice: v.voice, style: v.voiceStyle });
      }
    }
  }
  for (const entry of Object.values(MISSIONS)) {
    const { mission } = entry.build();
    for (const event of mission.director) {
      for (const action of event.actions) {
        if (action.type === 'message' && action.speaker === HQ_PROFILE.callSign) {
          jobs.push({ key: action.lineKey, speaker: HQ_PROFILE.callSign, text: action.text, voice: HQ_PROFILE.voice, style: HQ_PROFILE.voiceStyle });
        }
      }
    }
  }
  const keys = new Set<string>();
  for (const job of jobs) {
    if (keys.has(job.key)) throw new Error(`Duplicate voice key ${job.key}`);
    keys.add(job.key);
  }
  return only ? jobs.filter((j) => j.key.startsWith(only)) : jobs;
}

const hashOf = (job: Job) => createHash('sha256').update(`${MODEL}|${job.voice}|${job.style}|${job.text}`).digest('hex').slice(0, 16);

async function loadManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST, 'utf8')) as Manifest;
  } catch {
    return { version: 1, model: MODEL, generatedAt: '', lines: {} };
  }
}

function findAudio(node: unknown): { data: string; mime: string | null } | null {
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i -= 1) {
      const found = findAudio(node[i]);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'audio' && typeof obj.data === 'string') return { data: obj.data, mime: (obj.mime_type as string) ?? null };
  for (const value of Object.values(obj)) {
    const found = findAudio(value);
    if (found) return found;
  }
  return null;
}

function pcmToWav(pcm: Buffer, rate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function synthesize(job: Job): Promise<{ audio: Buffer; tokensIn: number; tokensOut: number }> {
  const body = {
    model: MODEL,
    input: [{ type: 'user_input', content: [{ type: 'text', text: job.text, annotations: [{ type: 'speech_metadata', style: job.style }] }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: job.voice }] },
    store: false,
  };
  for (let attempt = 1; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      if (attempt <= 3) {
        await sleep(4000 * attempt);
        continue;
      }
      throw new Error(`request failed: ${(err as Error).message}`);
    }
    const raw = await res.text();
    if (!res.ok) {
      if (RETRYABLE.has(res.status) && attempt <= 3) {
        log(`${job.key}: HTTP ${res.status}, retrying`);
        await sleep(8000 * attempt);
        continue;
      }
      let message = raw.slice(0, 300);
      try {
        message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // keep the raw excerpt
      }
      throw new Error(`HTTP ${res.status}: ${message}`);
    }
    const json = JSON.parse(raw) as { usage?: Record<string, number> };
    const block = findAudio(json);
    if (!block) throw new Error('no audio in the response');
    let audio: Buffer = Buffer.from(block.data, 'base64');
    if (audio.toString('ascii', 0, 4) !== 'RIFF') {
      const rate = Number(/rate=(\d+)/i.exec(block.mime ?? '')?.[1] ?? 24000);
      audio = pcmToWav(audio, rate);
    }
    return { audio, tokensIn: json.usage?.total_input_tokens ?? 0, tokensOut: json.usage?.total_output_tokens ?? 0 };
  }
}

/** Trims leading and trailing silence and encodes a small mono MP3. */
async function encode(wav: Buffer, out: string, tmp: string): Promise<number> {
  const input = path.join(tmp, `${path.basename(out)}.wav`);
  await fs.writeFile(input, wav);
  const trim = 'silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-af', `${trim},areverse,${trim},areverse`, '-ac', '1', '-ar', '24000', '-b:a', '48k', out]);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim());
  return Math.round(seconds * 100) / 100;
}

async function main(): Promise<void> {
  const jobs = collectJobs();
  const manifest = await loadManifest();
  const pending = jobs.filter((job) => force || manifest.lines[job.key]?.hash !== hashOf(job) || !existsSync(path.join(OUT_DIR, `${job.key}.mp3`)));
  const chars = pending.reduce((n, j) => n + j.text.length, 0);
  // Roughly 4 characters per input token and 25 audio tokens per second of ~14 characters.
  const estimate = ((chars / 4 + pending.length * 20) * PRICE_IN + (chars / 14) * 25 * PRICE_OUT) / 1e6;
  log(`${jobs.length} lines in the bank, ${pending.length} to generate (about $${estimate.toFixed(3)})`);
  if (dryRun) {
    for (const job of pending) console.log(`  ${job.key.padEnd(28)} ${job.voice.padEnd(14)} ${job.text}`);
    return;
  }
  if (pending.length === 0) return;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not set');
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  await fs.mkdir(OUT_DIR, { recursive: true });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-bank-'));

  let tokensIn = 0;
  let tokensOut = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const job = pending[next++]!;
      try {
        const result = await synthesize(job);
        const file = `${job.key}.mp3`;
        const seconds = await encode(result.audio, path.join(OUT_DIR, file), tmp);
        tokensIn += result.tokensIn;
        tokensOut += result.tokensOut;
        manifest.lines[job.key] = { file, seconds, voice: job.voice, speaker: job.speaker, text: job.text, hash: hashOf(job) };
        log(`ok   ${job.key} (${seconds}s)`);
      } catch (err) {
        failed += 1;
        log(`FAIL ${job.key}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));

  // Drop entries for lines that no longer exist in the content.
  const live = new Set(collectJobs().map((j) => j.key));
  if (!only) for (const key of Object.keys(manifest.lines)) if (!live.has(key)) delete manifest.lines[key];
  manifest.model = MODEL;
  manifest.generatedAt = new Date().toISOString();
  manifest.lines = Object.fromEntries(Object.entries(manifest.lines).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.rm(tmp, { recursive: true, force: true });
  const cost = (tokensIn * PRICE_IN + tokensOut * PRICE_OUT) / 1e6;
  log(`done: ${pending.length - failed} generated, ${failed} failed, ${tokensIn} input / ${tokensOut} output tokens, about $${cost.toFixed(3)}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(redact(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
