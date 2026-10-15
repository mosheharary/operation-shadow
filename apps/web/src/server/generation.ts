import { randomInt } from 'node:crypto';
import { disabledProvider, examplePlan, geminiProvider, generateMission, type MissionPlanProvider, mockProvider, type ProviderId } from '@operation-shadow/ai';
import {
  aiSpendSince,
  claimGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  getGenerationJob,
  getOwnedMission,
  type JobRow,
  type MissionRow,
  recordAiUsage,
  setGenerationJobStage,
} from '@operation-shadow/db';
import { type GeneratedMission, generatedMissionSchema, type GenerationJob, generationRequestSchema, type JobStage } from '@operation-shadow/schemas';
import { getDb } from './db';
import { getServerEnv } from './env';

/** A worker holds a job this long per claim; longer than one model call with retries. */
const LEASE_MS = 150_000;

const STAGE_MESSAGE: Record<JobStage, string> = {
  queued: 'Waiting for Lantern',
  drafting: 'Lantern is drafting the operation',
  validating: 'Checking the plan against field intelligence',
  building: 'Surveying the ground and testing a silent route',
  ready: 'Operation ready',
  failed: 'The operation could not be prepared',
  cancelled: 'Cancelled',
};

/** Which provider this deployment uses: a key enables Gemini; `mock` is refused in production. */
export function configuredProvider(): ProviderId {
  const env = getServerEnv();
  if (env.AI_PROVIDER === 'mock') return env.APP_ENV === 'production' ? 'disabled' : 'mock';
  if (env.AI_PROVIDER === 'disabled') return 'disabled';
  return env.GOOGLE_API_KEY ? 'gemini' : 'disabled';
}

function providerFor(id: ProviderId): MissionPlanProvider {
  const env = getServerEnv();
  if (id === 'gemini' && env.GOOGLE_API_KEY) return geminiProvider({ apiKey: env.GOOGLE_API_KEY, model: env.GEMINI_TEXT_MODEL });
  if (id === 'mock') {
    const scenario = env.AI_MOCK_SCENARIO ?? 'valid';
    return mockProvider(scenario, () => examplePlan(generationRequestSchema.parse({}), 1));
  }
  return disabledProvider;
}

const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

/** The provider for a new job: Gemini only while the global monthly budget has room. */
export async function providerForNewJob(): Promise<ProviderId> {
  const id = configuredProvider();
  if (id !== 'gemini') return id;
  const spent = await aiSpendSince(getDb().db, monthStart());
  return spent < getServerEnv().AI_MONTHLY_BUDGET_USD ? 'gemini' : 'disabled';
}

export const newSeed = () => randomInt(1, 2 ** 31 - 1);

export const missionKey = (missionId: string) => `op-${missionId}`;

export function jobDto(job: JobRow, mission?: Pick<MissionRow, 'id' | 'source'> | null): GenerationJob {
  const stage = job.stage as JobStage;
  return {
    id: job.id,
    stage,
    message: stage === 'failed' && job.error ? job.error : STAGE_MESSAGE[stage],
    missionKey: job.missionId ? missionKey(job.missionId) : null,
    source: (mission?.source as GenerationJob['source']) ?? null,
    provider: job.provider as GenerationJob['provider'],
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/**
 * Drives a job to completion if no one else is: claim the lease, run the pipeline (which always
 * produces a playable mission, falling back to the offline generator), store it atomically.
 * Safe to call repeatedly and concurrently (the loading screen's polling does).
 */
export async function advanceJob(ownerId: string, jobId: string): Promise<JobRow | null> {
  const { db } = getDb();
  const job = await claimGenerationJob(db, ownerId, jobId, LEASE_MS);
  if (!job) return getGenerationJob(db, ownerId, jobId);
  const request = generationRequestSchema.parse(job.request);
  const controller = new AbortController();
  try {
    const outcome = await generateMission({
      request,
      key: missionKey('00000000-0000-4000-8000-000000000000'),
      seed: job.seed,
      provider: providerFor(job.provider as ProviderId),
      signal: controller.signal,
      onStage: async (stage) => {
        // A cancelled job stops before the next model call.
        if (!(await setGenerationJobStage(db, job.id, stage, LEASE_MS))) controller.abort();
      },
    });
    await recordAiUsage(
      db,
      outcome.usage.map((u) => ({ userId: ownerId, jobId: job.id, purpose: 'mission-plan', ...u })),
    );
    if (controller.signal.aborted) return getGenerationJob(db, ownerId, jobId);
    await completeGenerationJob(db, job, {
      source: outcome.source,
      templateId: outcome.spec.templateId,
      specVersion: outcome.spec.version,
      generatorVersion: outcome.report.generatorVersion,
      seed: outcome.spec.seed,
      title: outcome.spec.title,
      // The key is derived from the row id when served; the stored spec id is a placeholder.
      spec: outcome.spec as unknown as Record<string, unknown>,
      briefing: outcome.briefing as unknown as Record<string, unknown>,
      levelHash: outcome.report.levelHash,
      report: outcome.report as unknown as Record<string, unknown>,
    });
  } catch (err) {
    console.error('[generation] job failed', err instanceof Error ? err.name : typeof err);
    await failGenerationJob(db, job.id, 'The operation could not be prepared. Please try again.');
  }
  return getGenerationJob(db, ownerId, jobId);
}

/** A generated mission owned by this user, validated before it reaches the client. */
export async function loadGeneratedMission(ownerId: string, key: string): Promise<GeneratedMission | null> {
  const match = /^op-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(key);
  if (!match) return null;
  const row = await getOwnedMission(getDb().db, ownerId, match[1]!);
  if (!row) return null;
  const parsed = generatedMissionSchema.safeParse({ key, source: row.source, spec: { ...row.spec, id: key }, briefing: row.briefing });
  return parsed.success ? parsed.data : null;
}
