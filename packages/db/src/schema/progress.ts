import { customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * A player's campaign: difficulty and progression (completed missions with best results, flags
 * later missions read, per-specialist service records). `version` guards concurrent updates.
 */
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    difficulty: text('difficulty').notNull().default('standard'),
    progress: jsonb('progress').$type<Record<string, unknown>>().notNull().default({}),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('campaigns_owner_updated_idx').on(t.ownerId, t.updatedAt)],
);

/** One attempt at a mission: what was deployed and how it ended. */
export const missionRuns = pgTable(
  'mission_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    missionKey: text('mission_key').notNull(),
    squad: jsonb('squad').$type<string[]>().notNull(),
    difficulty: text('difficulty').notNull(),
    seed: integer('seed').notNull(),
    /** running | success | failure | abandoned */
    outcome: text('outcome').notNull().default('running'),
    stats: jsonb('stats').$type<Record<string, unknown>>(),
    score: integer('score'),
    /** S, A, B, C or D on success. */
    rank: text('rank'),
    medals: jsonb('medals').$type<string[]>(),
    durationSeconds: integer('duration_seconds'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('mission_runs_owner_started_idx').on(t.ownerId, t.startedAt)],
);

/** Named save slots (quick, auto, manual-1…). Each points at its newest revision. */
export const saveSlots = pgTable(
  'save_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    slot: text('slot').notNull(),
    missionKey: text('mission_key').notNull(),
    /** Player-facing summary: mission title, mission time, objectives done, squad. */
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull(),
    currentRevisionId: uuid('current_revision_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('save_slots_owner_slot_idx').on(t.ownerId, t.slot)],
);

/** Immutable save payloads (gzip JSON). The newest three per slot are kept for recovery. */
export const saveRevisions = pgTable(
  'save_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => saveSlots.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    schemaVersion: integer('schema_version').notNull(),
    payload: bytea('payload').notNull(),
    /** SHA-256 (hex) of the uncompressed JSON. */
    checksum: text('checksum').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('save_revisions_slot_created_idx').on(t.slotId, t.createdAt)],
);
