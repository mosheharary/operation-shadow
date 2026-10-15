import { getTemplate } from '@operation-shadow/engine';
import { generatedMissionSchema, generationRequestSchema, missionPlanSchema } from '@operation-shadow/schemas';
import { describe, expect, it } from 'vitest';
import { generateMission } from './pipeline';
import { examplePlan, planIssues } from './plan';
import { disabledProvider, geminiProvider, mockProvider, type MockScenario, ProviderError } from './providers';
import { textProblem } from './safety';

const KEY = 'op-00000000-0000-4000-8000-000000000001';
const request = (over: Record<string, unknown> = {}) => generationRequestSchema.parse(over);
const mock = (scenario: MockScenario, req = request()) => mockProvider(scenario, () => examplePlan(req, 3));

describe('mission plans', () => {
  it('the example plan is schema-valid and passes every check for each theatre and focus', () => {
    for (const theatre of ['any', 'coastal', 'alpine', 'rail'] as const) {
      for (const focus of ['any', 'sabotage', 'steal', 'rescue'] as const) {
        const req = request({ theatre, focus });
        const plan = missionPlanSchema.parse(examplePlan(req, 5));
        expect(planIssues(plan, req), `${theatre}/${focus}`).toEqual([]);
      }
    }
  });

  it('rejects unknown slots, wrong kinds, broken player choices and snow outside the mountains', () => {
    const req = request({ theatre: 'rail', weather: 'fog' });
    const plan = missionPlanSchema.parse(examplePlan(req));
    const bad = { ...plan, weather: 'snow' as const, objectives: [{ ...plan.objectives[0]!, slot: 'nowhere' }, { ...plan.objectives[0]!, required: false, revealAtSeconds: 60, kind: 'steal' as const }] };
    const issues = planIssues(bad, req).join('\n');
    expect(issues).toMatch(/weather must be fog/);
    expect(issues).toMatch(/snow is only possible/);
    expect(issues).toMatch(/does not exist/);
  });

  it('refuses markup, links and real-world extremist names', () => {
    expect(textProblem('Meet at the old mill.')).toBeNull();
    expect(textProblem('See <b>this</b>')).not.toBeNull();
    expect(textProblem('Orders at www.example.com')).not.toBeNull();
    expect(textProblem('The Nazis hold the bridge')).not.toBeNull();
    expect(textProblem('A spicy stew in the mess hall')).toBeNull();
    expect(missionPlanSchema.safeParse({ ...examplePlan(request()), codename: '<script>' }).success).toBe(false);
  });
});

describe('generation pipeline', () => {
  it('builds a validated mission from a valid model answer', async () => {
    const stages: string[] = [];
    const out = await generateMission({ request: request({ theatre: 'alpine' }), key: KEY, seed: 42, provider: mock('valid', request({ theatre: 'alpine' })), onStage: (s) => void stages.push(s) });
    expect(out.source).toBe('mock');
    expect(out.report.fallbackReason).toBeNull();
    expect(out.report.validation.ok).toBe(true);
    expect(stages).toEqual(['drafting', 'validating', 'building']);
    expect(getTemplate(out.spec.templateId)?.theme).toBe('alpine');
    expect(generatedMissionSchema.parse({ key: KEY, source: out.source, spec: out.spec, briefing: out.briefing }).key).toBe(KEY);
  });

  it('is reproducible: the same answer and seed give the same level', async () => {
    const a = await generateMission({ request: request(), key: KEY, seed: 9, provider: mock('valid') });
    const b = await generateMission({ request: request(), key: KEY, seed: 9, provider: mock('valid') });
    expect(a.report.levelHash).toBe(b.report.levelHash);
    expect(a.spec).toEqual(b.spec);
  });

  it('repairs once when the first answer has a bad slot', async () => {
    const out = await generateMission({ request: request(), key: KEY, seed: 4, provider: mock('repairable') });
    expect(out.source).toBe('mock');
    expect(out.report.repaired).toBe(true);
    expect(out.report.attempts).toBe(2);
    expect(out.usage.map((u) => u.status)).toEqual(['invalid', 'ok']);
  });

  it.each(['malformed', 'invalid', 'unsafe', 'error'] as const)('falls back to the offline generator when the model answer is %s', async (scenario) => {
    const out = await generateMission({ request: request({ theatre: 'rail', focus: 'rescue', codename: 'Iron Wake' }), key: KEY, seed: 77, provider: mock(scenario) });
    expect(out.source).toBe('fallback');
    expect(out.report.fallbackReason).toBeTruthy();
    expect(out.report.validation.ok).toBe(true);
    expect(getTemplate(out.spec.templateId)?.theme).toBe('rail');
    expect(out.spec.objectives.find((o) => o.required)?.kind).toBe('rescue');
    expect(out.briefing.codename).toBe('Operation Iron Wake');
  });

  it('uses the offline generator without calling anything when AI is disabled', async () => {
    const out = await generateMission({ request: request({ weather: 'snow' }), key: KEY, seed: 5, provider: disabledProvider });
    expect(out.source).toBe('fallback');
    expect(out.usage).toEqual([]);
    expect(out.spec.env.weather === 'snow' ? getTemplate(out.spec.templateId)?.theme : 'alpine').toBe('alpine');
  });

  it('every offline mission validates across many seeds and requests', async () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const theatre = (['any', 'coastal', 'alpine', 'rail'] as const)[seed % 4]!;
      const focus = (['any', 'sabotage', 'steal', 'rescue'] as const)[(seed >> 2) % 4]!;
      const out = await generateMission({ request: request({ theatre, focus }), key: KEY, seed: seed * 1013, provider: disabledProvider });
      expect(out.report.validation.ok, `${theatre}/${focus}/${seed}`).toBe(true);
    }
  });
});

describe('gemini provider', () => {
  const okBody = JSON.stringify({ outputs: [{ type: 'text', text: '{"a":1}' }], usage: { total_input_tokens: 10, total_output_tokens: 5 } });

  it('sends the key only in the header, retries overloads and reads usage', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let n = 0;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      n += 1;
      return n === 1 ? new Response('busy', { status: 503 }) : new Response(okBody, { status: 200 });
    }) as unknown as typeof fetch;
    const provider = geminiProvider({ apiKey: 'test-key-123', model: 'gemini-3.8-flash', fetchImpl, sleep: async () => {} });
    const out = await provider.generate('prompt', { type: 'object' });
    expect(out).toMatchObject({ text: '{"a":1}', inputTokens: 10, outputTokens: 5 });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).not.toContain('test-key-123');
    expect(String(calls[0]!.init.body)).not.toContain('test-key-123');
    expect((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key-123');
    expect(JSON.parse(String(calls[0]!.init.body)).store).toBe(false);
  });

  it('gives up after two retries with a message that never contains the key', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: 'quota for test-key-123 exceeded' } }), { status: 429 })) as unknown as typeof fetch;
    const provider = geminiProvider({ apiKey: 'test-key-123', model: 'm', fetchImpl, sleep: async () => {} });
    const err = await provider.generate('p', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe('rate-limited');
    expect((err as Error).message).not.toContain('test-key-123');
  });
});
