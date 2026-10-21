import { sql } from 'drizzle-orm';
import { bigint, customType, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * Generated operations. The spec and briefing are validated JSON (packages/schemas); the level itself
 * is rebuilt deterministically from template + seed, and `level_hash` records what was validated.
 */
export const missions = pgTable(
  'missions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** gemini | mock | fallback */
    source: text('source').notNull(),
    templateId: text('template_id').notNull(),
    specVersion: integer('spec_version').notNull(),
    generatorVersion: text('generator_version').notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    title: text('title').notNull(),
    spec: jsonb('spec').$type<Record<string, unknown>>().notNull(),
    briefing: jsonb('briefing').$type<Record<string, unknown>>().notNull(),
    levelHash: text('level_hash').notNull(),
    report: jsonb('report').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('missions_owner_created_idx').on(t.ownerId, t.createdAt)],
);

/** The dossier sketch drawn for a generated operation (WebP, about 100 KB). Deleted with it. */
export const missionImages = pgTable('mission_images', {
  missionId: uuid('mission_id')
    .primaryKey()
    .references(() => missions.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Resumable, idempotent generation jobs (plan §8.3). Stages are claimed with a lease. */
export const generationJobs = pgTable(
  'generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    request: jsonb('request').$type<Record<string, unknown>>().notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    /** queued | drafting | validating | building | illustrating | ready | failed | cancelled */
    stage: text('stage').notNull().default('queued'),
    provider: text('provider').notNull(),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    /** Player-safe message: never contains keys, prompts or stack traces. */
    error: text('error'),
    missionId: uuid('mission_id').references(() => missions.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('generation_jobs_owner_key_idx').on(t.ownerId, t.idempotencyKey),
    index('generation_jobs_owner_created_idx').on(t.ownerId, t.createdAt),
    index('generation_jobs_active_idx')
      .on(t.stage)
      .where(sql`stage not in ('ready', 'failed', 'cancelled')`),
  ],
);

/** One row per model call: tokens, estimated cost and latency, for quotas and budgets (plan §8.5). */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    purpose: text('purpose').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_usage_created_idx').on(t.createdAt), index('ai_usage_user_created_idx').on(t.userId, t.createdAt)],
);
