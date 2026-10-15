import { z } from 'zod';

// Contracts for generated operations. The model may only choose ids, slots, counts and enum values;
// coordinates, geometry, code, URLs and markup are never accepted (plan §8.2, §8.5).

export const GENERATOR_TEMPLATE_IDS = ['coastal-harbor', 'alpine-ridge', 'rail-junction'] as const;
export const SPECIALIST_IDS = ['infiltrator', 'recon', 'engineer', 'deception', 'medic', 'marine'] as const;
export const WEATHER_IDS = ['clear', 'rain', 'fog', 'snow'] as const;
export const TIME_OF_DAY_IDS = ['dawn', 'day', 'dusk', 'night'] as const;
export const DENSITY_IDS = ['light', 'standard', 'heavy'] as const;
export const OBJECTIVE_KIND_IDS = ['sabotage', 'steal', 'rescue'] as const;

/** Hour of day used for each time-of-day choice. */
export const TIME_OF_DAY_HOURS: Record<(typeof TIME_OF_DAY_IDS)[number], number> = { dawn: 6, day: 13, dusk: 19, night: 23 };

/** Plain text: no markup, no links, no control characters. */
const plain = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((s) => isPlainText(s), 'must be plain text without markup or links');

/** True for text with no markup characters, links or control characters. */
export function isPlainText(s: string): boolean {
  if (/[<>{}\\`]|https?:|www\./i.test(s)) return false;
  for (let i = 0; i < s.length; i += 1) if (s.charCodeAt(i) < 32) return false;
  return true;
}

// ── Player request ─────────────────────────────────────────────────────────────────────────────

/** What the player asks for. Only enumerated choices and an optional sanitized codename reach the prompt. */
export const generationRequestSchema = z.strictObject({
  theatre: z.enum(['any', 'coastal', 'alpine', 'rail']).default('any'),
  timeOfDay: z.enum(['any', ...TIME_OF_DAY_IDS]).default('any'),
  weather: z.enum(['any', ...WEATHER_IDS]).default('any'),
  focus: z.enum(['any', ...OBJECTIVE_KIND_IDS]).default('any'),
  codename: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z][A-Za-z '-]*$/, 'letters, spaces, apostrophes and hyphens only')
    .optional(),
  /** Skip the model and use the offline generator (always offered while waiting). */
  offline: z.boolean().default(false),
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

// ── Model output ───────────────────────────────────────────────────────────────────────────────

export const missionPlanSchema = z.strictObject({
  codename: plain(3, 40),
  templateId: z.enum(GENERATOR_TEMPLATE_IDS),
  timeOfDay: z.enum(TIME_OF_DAY_IDS),
  weather: z.enum(WEATHER_IDS),
  density: z.enum(DENSITY_IDS),
  premise: z.array(plain(20, 400)).min(1).max(3),
  intel: z.array(plain(10, 240)).min(1).max(4),
  objectives: z
    .array(
      z.strictObject({
        kind: z.enum(OBJECTIVE_KIND_IDS),
        slot: z.string().max(40),
        title: plain(4, 60),
        description: plain(10, 200),
        required: z.boolean(),
        /** Hidden optional objective revealed by HQ after this many seconds (null = known from the start). */
        revealAtSeconds: z.number().int().min(30).max(600).nullable(),
      }),
    )
    .min(1)
    .max(3),
  hqMessages: z
    .array(z.strictObject({ atSeconds: z.number().int().min(5).max(900), text: plain(5, 160) }))
    .max(3),
  failOnFullAlarm: z.boolean(),
  recommended: z.array(z.enum(SPECIALIST_IDS)).min(1).max(4),
  debrief: z.strictObject({ success: plain(10, 240), failure: plain(10, 240) }),
});
export type MissionPlan = z.infer<typeof missionPlanSchema>;

// ── Stored generated mission (what the client rebuilds and plays) ──────────────────────────────

export const missionSpecSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(60),
  templateId: z.string().max(40),
  seed: z.number().int().min(0).max(2 ** 32 - 1),
  env: z.strictObject({ timeOfDay: z.number().min(0).max(24), weather: z.enum(WEATHER_IDS) }),
  density: z.enum(DENSITY_IDS),
  objectives: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(32),
        kind: z.enum(OBJECTIVE_KIND_IDS),
        slot: z.string().max(40),
        title: z.string().max(60),
        description: z.string().max(240),
        required: z.boolean(),
        revealAtSeconds: z.number().int().min(0).max(3600).optional(),
      }),
    )
    .min(1)
    .max(4),
  squad: z.strictObject({ required: z.array(z.enum(SPECIALIST_IDS)).max(6), min: z.number().int().min(1).max(6), max: z.number().int().min(1).max(6) }),
  failAtAlarm: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  parSeconds: z.number().int().min(60).max(7200),
  events: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(40),
        trigger: z.discriminatedUnion('type', [
          z.strictObject({ type: z.literal('time'), seconds: z.number().min(0).max(7200) }),
          z.strictObject({ type: z.literal('objective'), objectiveId: z.string().max(32) }),
          z.strictObject({ type: z.literal('alarm'), level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }),
        ]),
        action: z.discriminatedUnion('type', [
          z.strictObject({ type: z.literal('message'), text: z.string().max(240) }),
          z.strictObject({ type: z.literal('reinforce'), sector: z.string().max(32), count: z.number().int().min(1).max(4) }),
          z.strictObject({ type: z.literal('weather'), weather: z.enum(WEATHER_IDS) }),
        ]),
      }),
    )
    .max(12),
  dynamicEvents: z.boolean().optional(),
});

export const generatedBriefingSchema = z.strictObject({
  codename: z.string().max(60),
  location: z.string().max(80),
  time: z.string().max(10),
  weather: z.string().max(40),
  premise: z.array(z.string().max(400)).max(4),
  intel: z.array(z.string().max(240)).max(6),
  warnings: z.array(z.string().max(240)).max(6),
  insertion: z.string().max(200),
  extraction: z.string().max(200),
  recommended: z.array(z.enum(SPECIALIST_IDS)).max(6),
  debrief: z.strictObject({ success: z.string().max(240), failure: z.string().max(240) }),
});
export type GeneratedBriefing = z.infer<typeof generatedBriefingSchema>;

export const missionSourceSchema = z.enum(['gemini', 'mock', 'fallback']);
export type MissionSource = z.infer<typeof missionSourceSchema>;

/** A generated operation as served to its owner. */
export const generatedMissionSchema = z.strictObject({
  key: z.string().regex(/^op-[0-9a-f-]{36}$/),
  source: missionSourceSchema,
  spec: missionSpecSchema,
  briefing: generatedBriefingSchema,
});
export type GeneratedMission = z.infer<typeof generatedMissionSchema>;

// ── Generation jobs API ────────────────────────────────────────────────────────────────────────

export const JOB_STAGES = ['queued', 'drafting', 'validating', 'building', 'ready', 'failed', 'cancelled'] as const;
export const jobStageSchema = z.enum(JOB_STAGES);
export type JobStage = z.infer<typeof jobStageSchema>;

export const generationJobSchema = z.object({
  id: z.uuid(),
  stage: jobStageSchema,
  /** Player-facing description of the current stage. */
  message: z.string().max(200),
  missionKey: z.string().nullable(),
  source: missionSourceSchema.nullable(),
  /** Whether this deployment can reach the model at all (otherwise the offline generator is used). */
  provider: z.enum(['gemini', 'mock', 'disabled']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type GenerationJob = z.infer<typeof generationJobSchema>;
