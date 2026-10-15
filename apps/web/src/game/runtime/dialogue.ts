import { type DialogueLine, GUARD_BARKS, HQ_PROFILE, SPECIALIST_PROFILES, SQUAD_BARKS } from '@operation-shadow/content';
import type { BarkLine, GameEvent, World } from '@operation-shadow/engine';
import { useGameUi } from './store';

/** A line chosen for playback: subtitle text plus the voice file to play, if one exists. */
export interface SpokenLine {
  speaker: string;
  text: string;
  /** Voice bank key (file name without extension), or null for text-only lines. */
  voiceKey: string | null;
  /** Voice that speaks it (squad member, guard voice or HQ), for audio routing. */
  channel: 'squad' | 'guard' | 'hq';
  /** World position for spatialised guard voices. */
  pos: { x: number; z: number } | null;
  priority: number;
  seconds: number;
}

const SQUAD_KEYS = new Set<BarkLine>(['ack-move', 'ack-action', 'warn-patrol', 'success', 'downed']);
/** Minimum gap between lines from the same speaker (ms), by priority. */
const SPEAKER_COOLDOWN = [0, 6000, 2500, 0, 0];
/** Acknowledgements are skipped while any other line is still on screen. */
const CHATTER_PRIORITY = 1;

function readingSeconds(text: string): number {
  return Math.min(7, Math.max(2.2, text.split(/\s+/).length * 0.38));
}

/**
 * Turns simulation events into spoken lines: picks variants without repeating the last ones,
 * applies per-speaker cooldowns and priorities, and posts subtitles. Audio subscribes via onLine.
 */
export class DialogueDirector {
  private readonly lastBySpeaker = new Map<string, number>();
  private readonly recent = new Map<string, string[]>();
  private readonly listeners = new Set<(line: SpokenLine) => void>();

  constructor(private readonly getWorld: () => World) {}

  onLine(listener: (line: SpokenLine) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handle(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'bark') this.bark(e.speaker, e.line, e.priority);
      else if (e.type === 'message') this.message(e.speaker, e.lineKey, e.text);
      else if (e.type === 'ability' && e.phase === 'complete' && SUCCESS_ABILITIES.has(e.abilityId)) this.bark(e.unitId, 'success', 1);
    }
  }

  private pick(bank: string, lines: DialogueLine[]): DialogueLine | null {
    if (lines.length === 0) return null;
    const recent = this.recent.get(bank) ?? [];
    const fresh = lines.filter((l) => !recent.includes(l.key));
    const pool = fresh.length > 0 ? fresh : lines;
    const line = pool[Math.floor(Math.random() * pool.length)]!;
    this.recent.set(bank, [...recent, line.key].slice(-Math.max(1, lines.length - 1)));
    return line;
  }

  private canSpeak(speaker: string, priority: number): boolean {
    const now = performance.now();
    const last = this.lastBySpeaker.get(speaker) ?? -Infinity;
    if (now - last < (SPEAKER_COOLDOWN[priority] ?? 0)) return false;
    if (priority <= CHATTER_PRIORITY && useGameUi.getState().subtitles.some((s) => s.until > now)) return false;
    return true;
  }

  private emit(id: string, line: SpokenLine): void {
    this.lastBySpeaker.set(id, performance.now());
    useGameUi.getState().subtitle(line.speaker, line.text, line.seconds, line.priority);
    for (const listener of this.listeners) listener(line);
  }

  bark(speakerId: string, key: BarkLine, priority: number): void {
    if (!this.canSpeak(speakerId, priority)) return;
    const world = this.getWorld();
    const op = world.operative(speakerId);
    if (op && SQUAD_KEYS.has(key)) {
      const lines = SQUAD_BARKS[op.role][key as keyof (typeof SQUAD_BARKS)[typeof op.role]];
      const line = this.pick(`${op.role}:${key}`, lines);
      if (!line) return;
      this.emit(speakerId, {
        speaker: SPECIALIST_PROFILES[op.role].callSign,
        text: line.text,
        voiceKey: line.key,
        channel: 'squad',
        pos: null,
        priority,
        seconds: readingSeconds(line.text),
      });
      return;
    }
    const guard = world.guard(speakerId);
    if (guard && !SQUAD_KEYS.has(key)) {
      const lines = GUARD_BARKS[key as keyof typeof GUARD_BARKS];
      const line = this.pick(`guard:${key}`, lines);
      if (!line) return;
      const voice = guard.rank === 'soldier' ? 'a' : 'b';
      this.emit(speakerId, {
        speaker: guard.rank === 'officer' ? 'Officer' : guard.rank === 'nco' ? 'Sergeant' : 'Sentry',
        text: line.text,
        voiceKey: `${line.key}-${voice}`,
        channel: 'guard',
        pos: { ...guard.pos },
        priority,
        seconds: readingSeconds(line.text),
      });
    }
  }

  message(speaker: string, lineKey: string, text: string): void {
    this.emit(speaker, {
      speaker: speaker === HQ_PROFILE.callSign ? `${HQ_PROFILE.callSign} (HQ)` : speaker,
      text,
      voiceKey: lineKey,
      channel: 'hq',
      pos: null,
      priority: 4,
      seconds: readingSeconds(text) + 1.5,
    });
  }
}

const SUCCESS_ABILITIES = new Set(['takedown', 'chloroform', 'sedative', 'dart', 'sabotage', 'lockpick', 'cut-fence', 'restrain', 'revive']);
