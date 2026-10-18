import { type GameEvent, obstructionLoss, Surface, type Vec2 } from '@operation-shadow/engine';
import * as THREE from 'three';
import type { GameController } from '../runtime/controller';
import type { SpokenLine } from '../runtime/dialogue';
import type { GameSettings } from '../runtime/settings';
import { type LoopName, SoundBank, type SoundName } from './synth';

type Bus = 'music' | 'voice' | 'effects' | 'ambient' | 'ui';
type MusicTrack = 'stealth' | 'alert' | 'theme';

interface VoiceManifest {
  lines: Record<string, { file: string; seconds: number }>;
}

const MUSIC_FILES: Record<MusicTrack, string> = {
  stealth: '/media/music/stealth.mp3',
  alert: '/media/music/alert.mp3',
  theme: '/media/music/theme.mp3',
};

/** Effects further than this from the listener are not started at all. */
const AUDIBLE_RANGE = 70;
const MAX_VOICES = 28;

const STEP_FOR_SURFACE: Partial<Record<Surface, SoundName>> = {
  [Surface.Gravel]: 'step-hard',
  [Surface.Stone]: 'step-hard',
  [Surface.Concrete]: 'step-hard',
  [Surface.Rock]: 'step-hard',
  [Surface.Wood]: 'step-wood',
  [Surface.Metal]: 'step-wood',
  [Surface.ShallowWater]: 'step-water',
  [Surface.DeepWater]: 'step-water',
};

const NOISE_SOUNDS: Partial<Record<string, SoundName>> = {
  scuffle: 'thud',
  'body-fall': 'thud',
  impact: 'impact',
  device: 'device',
  'suppressed-shot': 'suppressed',
  harpoon: 'harpoon',
  gunshot: 'gunshot',
  explosion: 'explosion',
  tool: 'tool',
};

/** Loudness in dB at 1 m to a playback gain (engine levels drive the mix, so the AI and the ears agree). */
const gainForDb = (db: number) => Math.min(1, Math.max(0.04, 10 ** ((db - 70) / 40)));

/**
 * Web Audio mixer for a mission: buses with player volumes, positional effects with wall
 * occlusion, weather ambience, the alarm siren, adaptive music and the voice bank.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bank: SoundBank | null = null;
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private duck!: GainNode;
  private readonly loops = new Map<LoopName, { source: AudioBufferSourceNode; gain: GainNode }>();
  private readonly music = new Map<MusicTrack, { el: HTMLAudioElement; gain: GainNode }>();
  private musicState: MusicTrack | 'none' = 'none';
  private voiceManifest: VoiceManifest | null = null;
  private readonly voiceCache = new Map<string, Promise<AudioBuffer | null>>();
  private active = 0;
  private listenerPos: Vec2 = { x: 0, z: 0 };
  private readonly forward = new THREE.Vector3();
  private settings: GameSettings | null = null;
  private disposed = false;
  private readonly unlock = () => void this.resume();

  constructor(private readonly controller: GameController) {}

  /** Creates the audio graph. Browsers keep it suspended until the first click or key press. */
  start(settings: GameSettings): void {
    if (this.ctx) return;
    this.disposed = false;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.bank = new SoundBank(ctx);
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    for (const bus of ['music', 'voice', 'effects', 'ambient', 'ui'] as Bus[]) {
      const gain = ctx.createGain();
      gain.connect(bus === 'music' ? this.duck : this.master);
      this.buses[bus] = gain;
    }
    this.applySettings(settings);
    window.addEventListener('pointerdown', this.unlock);
    window.addEventListener('keydown', this.unlock);
    void this.resume();
    void fetch('/media/voice/manifest.json')
      .then((res) => (res.ok ? (res.json() as Promise<VoiceManifest>) : null))
      .then((manifest) => {
        this.voiceManifest = manifest;
      })
      .catch(() => {
        this.voiceManifest = null;
      });
    this.startAmbience();
  }

  private async resume(): Promise<void> {
    if (!this.ctx || this.disposed) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined);
    if (this.ctx.state === 'running') {
      window.removeEventListener('pointerdown', this.unlock);
      window.removeEventListener('keydown', this.unlock);
      for (const { el } of this.music.values()) if (el.paused && el.dataset.wanted === '1') void el.play().catch(() => undefined);
    }
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    for (const { el } of this.music.values()) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.bank = null;
    this.music.clear();
    this.loops.clear();
    this.voiceCache.clear();
    this.musicState = 'none';
    this.active = 0;
  }

  applySettings(settings: GameSettings): void {
    this.settings = settings;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.masterVolume, now, 0.05);
    this.buses.music.gain.setTargetAtTime(settings.musicVolume, now, 0.05);
    this.buses.voice.gain.setTargetAtTime(settings.voiceVolume, now, 0.05);
    this.buses.effects.gain.setTargetAtTime(settings.effectsVolume, now, 0.05);
    this.buses.ambient.gain.setTargetAtTime(settings.effectsVolume * 0.8, now, 0.05);
    this.buses.ui.gain.setTargetAtTime(settings.effectsVolume * 0.7, now, 0.05);
  }

  // ── Listener ────────────────────────────────────────────────────────────────────────────

  /** Ears sit at the ground point the camera looks at, facing the way the camera faces. */
  updateListener(camera: THREE.Camera, focus: THREE.Vector3): void {
    const ctx = this.ctx;
    if (!ctx) return;
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    const l = ctx.listener;
    const t = ctx.currentTime;
    this.listenerPos = { x: focus.x, z: focus.z };
    if (l.positionX) {
      l.positionX.setTargetAtTime(focus.x, t, 0.05);
      l.positionY.setTargetAtTime(focus.y + 4, t, 0.05);
      l.positionZ.setTargetAtTime(focus.z, t, 0.05);
      l.forwardX.setTargetAtTime(this.forward.x, t, 0.05);
      l.forwardY.setTargetAtTime(0, t, 0.05);
      l.forwardZ.setTargetAtTime(this.forward.z, t, 0.05);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(focus.x, focus.y + 4, focus.z);
      l.setOrientation(this.forward.x, 0, this.forward.z, 0, 1, 0);
    }
  }

  // ── One-shots ───────────────────────────────────────────────────────────────────────────

  /** A positional effect, muffled by the walls between it and the listener. */
  playAt(name: SoundName, pos: Vec2, options: { gain?: number; rate?: number; bus?: Bus } = {}): void {
    const ctx = this.ctx;
    const bank = this.bank;
    if (!ctx || !bank || ctx.state !== 'running' || this.active >= MAX_VOICES) return;
    const dist = Math.hypot(pos.x - this.listenerPos.x, pos.z - this.listenerPos.z);
    if (dist > AUDIBLE_RANGE && name !== 'explosion' && name !== 'gunshot' && name !== 'bell') return;
    const world = this.controller.world;
    const source = ctx.createBufferSource();
    source.buffer = bank.get(name);
    source.playbackRate.value = (options.rate ?? 1) * (0.94 + Math.random() * 0.12);
    const gain = ctx.createGain();
    gain.gain.value = options.gain ?? 1;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 5;
    panner.rolloffFactor = 1.1;
    panner.maxDistance = 200;
    const y = world.grid.heightAt(pos) + 1;
    if (panner.positionX) {
      panner.positionX.value = pos.x;
      panner.positionY.value = y;
      panner.positionZ.value = pos.z;
    } else panner.setPosition(pos.x, y, pos.z);
    // Walls and closed doors between the sound and the listener muffle and quieten it.
    const loss = obstructionLoss(world.sound, this.listenerPos, pos);
    let tail: AudioNode = gain;
    if (loss > 1) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(350, 16000 * 10 ** (-loss / 25));
      gain.gain.value *= 10 ** (-loss / 45);
      gain.connect(filter);
      tail = filter;
    }
    source.connect(gain);
    tail.connect(panner);
    panner.connect(this.buses[options.bus ?? 'effects']);
    this.active += 1;
    source.onended = () => {
      this.active -= 1;
      panner.disconnect();
    };
    source.start();
  }

  play2D(name: SoundName, options: { gain?: number; bus?: Bus; delay?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.bank || ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    source.buffer = this.bank.get(name);
    const gain = ctx.createGain();
    gain.gain.value = options.gain ?? 1;
    source.connect(gain).connect(this.buses[options.bus ?? 'ui']);
    source.start(ctx.currentTime + (options.delay ?? 0));
  }

  // ── Simulation events ───────────────────────────────────────────────────────────────────

  handle(events: GameEvent[]): void {
    if (!this.ctx) return;
    const world = this.controller.world;
    for (const e of events) {
      switch (e.type) {
        case 'footstep': {
          const surface = world.level.surface[world.grid.cellAt(e.pos)] as Surface;
          const isOperative = e.unitId.startsWith('op:');
          this.playAt(STEP_FOR_SURFACE[surface] ?? 'step-soft', e.pos, { gain: gainForDb(e.db) * (isOperative ? 1 : 0.8) });
          break;
        }
        case 'noise': {
          const sound = NOISE_SOUNDS[e.kind];
          if (sound) this.playAt(sound, e.pos, { gain: gainForDb(e.db) });
          break;
        }
        case 'door': {
          const door = world.object(e.objectId);
          if (door) this.playAt('door', door.pos, { gain: 0.6, rate: e.open ? 1 : 1.15 });
          break;
        }
        case 'bell':
          for (let i = 0; i < 4; i += 1) window.setTimeout(() => this.playAt('bell', e.pos, { gain: 0.9 }), i * 520);
          break;
        case 'all-clear':
          this.play2D('all-clear', { gain: 0.6 });
          break;
        case 'detected':
          this.play2D('stinger-spotted', { gain: 0.8 });
          break;
        case 'alarm':
          if (e.level >= 3 && e.previous < 3) this.play2D('stinger-alert', { bus: 'music', gain: 0.9 });
          break;
        case 'rejected':
          this.play2D('ui-deny', { gain: 0.6 });
          break;
        case 'mission':
          this.play2D(e.status === 'success' ? 'success' : 'failure', { bus: 'music' });
          break;
        default:
          break;
      }
    }
  }

  uiClick(): void {
    this.play2D('ui-click', { gain: 0.5 });
  }

  uiDeny(): void {
    this.play2D('ui-deny', { gain: 0.6 });
  }

  // ── Voices ──────────────────────────────────────────────────────────────────────────────

  private loadVoice(key: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    const entry = this.voiceManifest?.lines[key];
    if (!ctx || !entry) return Promise.resolve(null);
    let pending = this.voiceCache.get(key);
    if (!pending) {
      pending = fetch(`/media/voice/${entry.file}`)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
      this.voiceCache.set(key, pending);
    }
    return pending;
  }

  /** Plays a dialogue line: squad and HQ over the radio, guards from where they stand. */
  speak(line: SpokenLine): void {
    if (!line.voiceKey || !this.ctx) return;
    void this.loadVoice(line.voiceKey).then((buffer) => {
      const ctx = this.ctx;
      if (!buffer || !ctx || ctx.state !== 'running') return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      source.connect(gain);
      let tail: AudioNode = gain;
      if (line.channel === 'guard' && line.pos) {
        const panner = ctx.createPanner();
        panner.panningModel = 'equalpower';
        panner.distanceModel = 'inverse';
        panner.refDistance = 6;
        panner.rolloffFactor = 1;
        const y = this.controller.world.grid.heightAt(line.pos) + 1.6;
        if (panner.positionX) {
          panner.positionX.value = line.pos.x;
          panner.positionY.value = y;
          panner.positionZ.value = line.pos.z;
        } else panner.setPosition(line.pos.x, y, line.pos.z);
        gain.connect(panner);
        tail = panner;
      } else {
        // Radio voice: band-limited, a little harsher for HQ's long-range set.
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = line.channel === 'hq' ? 420 : 260;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = line.channel === 'hq' ? 3200 : 5200;
        gain.connect(hp).connect(lp);
        tail = lp;
        if (line.channel === 'hq') this.playStatic(buffer.duration);
      }
      tail.connect(this.buses.voice);
      this.duckMusic(buffer.duration);
      source.start();
    });
  }

  private playStatic(seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bank) return;
    const source = ctx.createBufferSource();
    source.buffer = this.bank.loop('static');
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    source.connect(gain).connect(this.buses.voice);
    source.start();
    source.stop(ctx.currentTime + seconds + 0.15);
  }

  private duckMusic(seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(0.45, t, 0.08);
    this.duck.gain.setTargetAtTime(1, t + seconds, 0.4);
  }

  // ── Ambience, siren and music ───────────────────────────────────────────────────────────

  private startLoop(name: LoopName, level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bank || this.loops.has(name)) return;
    const source = ctx.createBufferSource();
    source.buffer = this.bank.loop(name);
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(this.buses.ambient);
    source.start(ctx.currentTime + Math.random() * 0.2);
    this.loops.set(name, { source, gain });
  }

  private setLoopLevel(name: LoopName, level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (level <= 0.001 && !this.loops.has(name)) return;
    this.startLoop(name, 0);
    this.loops.get(name)?.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
  }

  private startAmbience(): void {
    this.startLoop('surf', 0.0);
    this.startLoop('wind', 0.18);
  }

  private musicTrack(track: MusicTrack): { el: HTMLAudioElement; gain: GainNode } | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    let entry = this.music.get(track);
    if (!entry) {
      const el = new Audio(MUSIC_FILES[track]);
      el.loop = track !== 'theme';
      el.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain).connect(this.buses.music);
      entry = { el, gain };
      this.music.set(track, entry);
    }
    return entry;
  }

  private setMusic(next: MusicTrack | 'none'): void {
    const ctx = this.ctx;
    if (!ctx || next === this.musicState) return;
    this.musicState = next;
    const t = ctx.currentTime;
    for (const [track, entry] of this.music) {
      if (track === next) continue;
      entry.el.dataset.wanted = '0';
      entry.gain.gain.setTargetAtTime(0, t, 0.9);
      window.setTimeout(() => {
        if (entry.el.dataset.wanted !== '1') entry.el.pause();
      }, 4000);
    }
    if (next === 'none') return;
    const entry = this.musicTrack(next);
    if (!entry) return;
    entry.el.dataset.wanted = '1';
    if (next === 'theme') entry.el.currentTime = 0;
    if (ctx.state === 'running') void entry.el.play().catch(() => undefined);
    entry.gain.gain.setTargetAtTime(next === 'stealth' ? 0.7 : 0.85, t, 0.9);
  }

  /** Per-frame: weather beds, the siren, and the music state that follows the alarm. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const s = this.controller.world.state;
    this.setLoopLevel('rain', s.env.weather === 'rain' ? 0.35 : 0);
    const shore = this.distanceToSea();
    this.setLoopLevel('surf', Math.max(0, 0.5 - shore / 60));
    this.setLoopLevel('siren', s.alarm.sirens && s.status === 'running' ? 0.3 : 0);

    if (s.status !== 'running') {
      this.setMusic(s.status === 'success' ? 'theme' : 'none');
      return;
    }
    const watched = s.operatives.some((op) => op.noticedBy.length > 0);
    this.setMusic(s.alarm.level >= 3 ? 'alert' : 'stealth');
    const stealth = this.music.get('stealth');
    if (stealth && this.musicState === 'stealth') {
      // Tension: the quiet cue swells while someone is being watched or searched for.
      const level = watched || s.alarm.level === 2 ? 1 : 0.7;
      stealth.gain.gain.setTargetAtTime(level, ctx.currentTime, 1.2);
    }
  }

  private distanceToSea(): number {
    const world = this.controller.world;
    const { grid, level } = world;
    const p = this.listenerPos;
    for (let r = 0; r <= 48; r += 6) {
      for (let a = 0; a < 8; a += 1) {
        const x = p.x + Math.cos((a * Math.PI) / 4) * r;
        const z = p.z + Math.sin((a * Math.PI) / 4) * r;
        const cell = grid.cellAt({ x, z });
        if (cell < 0 || level.surface[cell] === Surface.DeepWater) return r;
      }
    }
    return 60;
  }
}
