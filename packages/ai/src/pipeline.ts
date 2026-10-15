import { compileAndValidate, getTemplate, levelHash, specIssues } from '@operation-shadow/engine';
import { type GenerationRequest, type MissionPlan, missionPlanSchema, type MissionSource } from '@operation-shadow/schemas';
import { z } from 'zod';
import { estimateCostUsd } from './cost';
import { type BuiltMission, buildPrompt, fallbackMission, planIssues, planToMission } from './plan';
import { type MissionPlanProvider, type ModelCall, ProviderError } from './providers';

export interface UsageRecord {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: 'ok' | 'invalid' | 'error';
}

export interface GenerationReport {
  provider: string;
  attempts: number;
  repaired: boolean;
  /** Why the offline generator was used, if it was. Safe to show. */
  fallbackReason: string | null;
  /** Problems found in the model's answers (paths and reasons only). */
  issues: string[];
  validation: { ok: boolean; stealthRouteMetres: number | null; guards: number; durationMs: number };
  levelHash: string;
  generatorVersion: string;
}

export interface GenerationOutcome extends BuiltMission {
  source: MissionSource;
  report: GenerationReport;
  usage: UsageRecord[];
}

export type GenerationStage = 'drafting' | 'validating' | 'building';

export interface GenerateOptions {
  request: GenerationRequest;
  /** Mission key (`op-<uuid>`), also the spec id. */
  key: string;
  seed: number;
  provider: MissionPlanProvider;
  signal?: AbortSignal;
  onStage?: (stage: GenerationStage) => Promise<void> | void;
}

/** JSON Schema sent with the request for structured output. */
export const PLAN_JSON_SCHEMA: Record<string, unknown> = (() => {
  const schema = z.toJSONSchema(missionPlanSchema, { io: 'input' }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
})();

function parsePlan(text: string): { plan: MissionPlan | null; issues: string[]; raw: unknown } {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim());
  } catch {
    return { plan: null, issues: ['the answer was not valid JSON'], raw: null };
  }
  const parsed = missionPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return { plan: null, issues: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`), raw };
  }
  return { plan: parsed.data, issues: [], raw };
}

function usageOf(call: ModelCall, provider: string, status: UsageRecord['status']): UsageRecord {
  return {
    provider,
    model: call.model,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    costUsd: provider === 'gemini' ? estimateCostUsd(call.model, call.inputTokens, call.outputTokens) : 0,
    latencyMs: call.latencyMs,
    status,
  };
}

/**
 * Plan §8.3: ask the model for a mission plan, validate it (schema, catalog references, content
 * safety), allow one repair, build and validate the level, and fall back to the deterministic
 * generator whenever any step fails. Always resolves with a playable mission.
 */
export async function generateMission(options: GenerateOptions): Promise<GenerationOutcome> {
  const { request, key, seed, provider } = options;
  const usage: UsageRecord[] = [];
  const issues: string[] = [];
  let attempts = 0;
  let fallbackReason: string | null = null;
  let built: BuiltMission | null = null;

  await options.onStage?.('drafting');
  if (provider.id === 'disabled') {
    fallbackReason = 'AI generation is not configured; the offline generator was used';
  } else {
    const prompt = buildPrompt(request);
    let input = prompt;
    for (let round = 0; round < 2 && !built; round += 1) {
      attempts += 1;
      let call: ModelCall;
      try {
        call = await provider.generate(input, PLAN_JSON_SCHEMA, options.signal);
      } catch (err) {
        usage.push({ provider: provider.id, model: provider.model, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0, status: 'error' });
        fallbackReason = err instanceof ProviderError ? `${err.message}; the offline generator was used` : 'The model request failed; the offline generator was used';
        break;
      }
      if (round === 0) await options.onStage?.('validating');
      const parsed = parsePlan(call.text);
      const problems = parsed.plan ? planIssues(parsed.plan, request) : parsed.issues;
      if (parsed.plan && problems.length === 0) {
        const candidate = planToMission(parsed.plan, key, seed);
        const template = getTemplate(candidate.spec.templateId)!;
        const specProblems = specIssues(candidate.spec, template);
        if (specProblems.length === 0) {
          usage.push(usageOf(call, provider.id, 'ok'));
          built = candidate;
          break;
        }
        problems.push(...specProblems);
      }
      usage.push(usageOf(call, provider.id, 'invalid'));
      issues.push(...problems.map((p) => `attempt ${round + 1}: ${p}`));
      if (round === 0) {
        // One repair: the model sees its own answer and the exact problems.
        input = `${prompt}\n\nYour previous answer was:\n${JSON.stringify(parsed.raw ?? call.text).slice(0, 6000)}\n\nIt has these problems:\n- ${problems.slice(0, 12).join('\n- ')}\n\nReturn the complete corrected JSON object.`;
      } else {
        fallbackReason = 'The generated plan did not pass validation after one repair; the offline generator was used';
      }
    }
  }

  await options.onStage?.('building');
  let source: MissionSource = provider.id === 'gemini' ? 'gemini' : 'mock';
  let compiled = built ? safeCompile(built) : null;
  if (built && !compiled?.report.ok) {
    fallbackReason = 'The generated mission could not be completed without being seen; the offline generator was used';
    issues.push(...(compiled?.report.issues ?? []).slice(0, 6).map((i) => `level: ${i.message}`));
    compiled = null;
  }
  if (!compiled) {
    source = 'fallback';
    // The offline generator is validated across seeds in tests; try a few neighbours to be certain.
    for (let i = 0; i < 4 && !compiled?.report.ok; i += 1) {
      built = fallbackMission(request, key, (seed + i * 7919) >>> 0);
      compiled = safeCompile(built);
    }
    if (!compiled?.report.ok) throw new Error('The offline generator could not build a valid mission');
  }
  const template = getTemplate(built!.spec.templateId)!;
  return {
    ...built!,
    source,
    usage,
    report: {
      provider: provider.id,
      attempts,
      repaired: source !== 'fallback' && attempts > 1,
      fallbackReason,
      issues: issues.slice(0, 30),
      validation: {
        ok: compiled.report.ok,
        stealthRouteMetres: compiled.report.stats.stealthRouteMetres,
        guards: compiled.report.stats.guards,
        durationMs: compiled.report.durationMs,
      },
      levelHash: levelHash(compiled.level),
      generatorVersion: template.version,
    },
  };
}

function safeCompile(mission: BuiltMission) {
  const template = getTemplate(mission.spec.templateId);
  if (!template) return null;
  try {
    return compileAndValidate(mission.spec, template);
  } catch {
    return null;
  }
}
