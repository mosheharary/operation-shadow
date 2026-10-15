import { z } from 'zod';
import { SPECIALIST_IDS } from './mission';

// Saves, mission runs, campaigns and preferences (plan §9).

export const SAVE_SLOTS = ['quick', 'auto', 'manual-1', 'manual-2', 'manual-3'] as const;
export const saveSlotSchema = z.enum(SAVE_SLOTS);
export type SaveSlotId = z.infer<typeof saveSlotSchema>;

/** Largest accepted upload (gzip) and its uncompressed limit. */
export const SAVE_MAX_COMPRESSED_BYTES = 1024 * 1024;
export const SAVE_MAX_JSON_BYTES = 8 * 1024 * 1024;

export const SAVE_SCHEMA_VERSION = 1;

const finite = z.number().finite();

export const difficultySchema = z.enum(['standard', 'veteran']);

export const missionKeySchema = z.string().regex(/^(?:[a-z][a-z0-9-]{1,40}|op-[0-9a-f-]{36})$/);

/**
 * A saved game. The simulation state is checked for its envelope here; the engine re-checks its
 * invariants when it restores it.
 */
export const savePayloadSchema = z.strictObject({
  version: z.literal(SAVE_SCHEMA_VERSION),
  missionKey: missionKeySchema,
  missionTitle: z.string().max(60),
  setup: z.strictObject({
    seed: z.number().int().min(1).max(2 ** 31 - 1),
    squad: z.array(z.enum(SPECIALIST_IDS)).min(1).max(6),
    difficulty: difficultySchema,
  }),
  state: z.looseObject({
    schemaVersion: z.literal(1),
    tick: z.number().int().min(0),
    levelId: z.string().max(100),
    missionId: z.string().max(100),
    status: z.literal('running'),
    operatives: z.array(z.looseObject({ id: z.string().max(40) })).min(1).max(6),
    objectives: z.array(z.looseObject({ id: z.string().max(40), status: z.string().max(20) })).max(8),
  }),
  camera: z.strictObject({ x: finite, z: finite, distance: finite, yaw: finite }).nullable(),
  selection: z.array(z.string().max(40)).max(6),
  savedAt: z.iso.datetime(),
});
export type SavePayload = z.infer<typeof savePayloadSchema>;

export const saveSummarySchema = z.object({
  slot: saveSlotSchema,
  missionKey: missionKeySchema,
  missionTitle: z.string(),
  seconds: z.number(),
  objectivesDone: z.number().int(),
  objectivesTotal: z.number().int(),
  squad: z.array(z.enum(SPECIALIST_IDS)),
  difficulty: difficultySchema,
  updatedAt: z.iso.datetime(),
});
export type SaveSummary = z.infer<typeof saveSummarySchema>;

// ── Mission runs and campaigns ─────────────────────────────────────────────────────────────────

export const RANKS = ['S', 'A', 'B', 'C', 'D'] as const;
export const MEDALS = ['ghost', 'restraint', 'untouchable', 'thorough', 'swift'] as const;

export const startRunSchema = z.strictObject({
  missionKey: missionKeySchema,
  squad: z.array(z.enum(SPECIALIST_IDS)).min(1).max(6),
  difficulty: difficultySchema,
  seed: z.number().int().min(1).max(2 ** 31 - 1),
});

export const completeRunSchema = z.strictObject({
  outcome: z.enum(['success', 'failure', 'abandoned']),
  score: z.number().int().min(0).max(100_000).nullable(),
  rank: z.enum(RANKS).nullable(),
  medals: z.array(z.enum(MEDALS)).max(MEDALS.length),
  durationSeconds: z.number().int().min(0).max(24 * 3600),
  stats: z.record(z.string().max(40), z.number().finite()).refine((r) => Object.keys(r).length <= 40, 'too many statistics'),
});

export const campaignProgressSchema = z.object({
  completed: z.record(
    z.string(),
    z.object({ bestScore: z.number().int(), bestRank: z.enum(RANKS), medals: z.array(z.enum(MEDALS)), completions: z.number().int(), lastCompletedAt: z.string() }),
  ),
  flags: z.array(z.string().max(60)).max(200),
  service: z.record(z.string(), z.object({ missions: z.number().int(), successes: z.number().int() })),
});
export type CampaignProgress = z.infer<typeof campaignProgressSchema>;

export const EMPTY_PROGRESS: CampaignProgress = { completed: {}, flags: [], service: {} };

// ── Preferences ────────────────────────────────────────────────────────────────────────────────

export const PREFERENCES_VERSION = 1;
export const preferencesSchema = z.strictObject({
  schemaVersion: z.literal(PREFERENCES_VERSION),
  settings: z
    .record(z.string().max(40), z.unknown())
    .refine((s) => JSON.stringify(s).length <= 16 * 1024, 'settings are too large'),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const deleteAccountSchema = z.strictObject({ confirm: z.literal('DELETE') });
