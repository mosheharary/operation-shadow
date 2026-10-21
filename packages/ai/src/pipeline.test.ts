import { getTemplate } from '@operation-shadow/engine';
import { generatedMissionSchema, generationRequestSchema, missionPlanSchema } from '@operation-shadow/schemas';
import { describe, expect, it } from 'vitest';
import { dossierImagePrompt, geminiImageProvider } from './image';
import { generateMission } from './pipeline';
import { buildPrompt, examplePlan, fallbackMission, planIssues, resolveRequest } from './plan';
import { disabledProvider, geminiProvider, mockProvider, type MockScenario, ProviderError } from './providers';
import { textProblem } from './safety';

const KEY = 'op-00000000-0000-4000-8000-000000000001';
const request = (over: Record<string, unknown> = {}) => generationRequestSchema.parse(over);
const mock = (scenario: MockScenario, req = request()) => mockProvider(scenario, () => examplePlan(req, 3));

describe('mission plans', () => {
  it('the example plan is schema-valid and passes every check for each theatre and focus', () => {
    for (const theatre of ['any', 'coastal', 'alpine', 'rail', 'forest', 'farmland'] as const) {
      for (const focus of ['any', 'sabotage', 'steal', 'rescue'] as const) {
        const req = request({ theatre, focus });
        const plan = missionPlanSchema.parse(examplePlan(req, 5));
        expect(planIssues(plan, req, 5), `${theatre}/${focus}`).toEqual([]);
      }
    }
  });

  it('rejects unknown slots, wrong kinds, broken player choices and snow outside the mountains', () => {
    const req = request({ theatre: 'rail', weather: 'fog' });
    const plan = missionPlanSchema.parse(examplePlan(req));
    const bad = { ...plan, weather: 'snow' as const, objectives: [{ ...plan.objectives[0]!, slot: 'nowhere' }, { ...plan.objectives[0]!, required: false, revealAtSeconds: 60, kind: 'steal' as const }] };
    const issues = planIssues(bad, req, 1).join('\n');
    expect(planIssues({ ...plan, templateId: 'site-rail-77' }, req, 1).join('\n')).toMatch(/templateId must be/);
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

describe('random choices', () => {
  it('resolve every Random choice, keep explicit ones, and differ between jobs', () => {
    const explicit = request({ theatre: 'rail', density: 'heavy', angle: 'defector' });
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const r = resolveRequest(request(), seed);
      expect(Object.entries(r).filter(([, v]) => v === 'any'), `seed ${seed}`).toEqual([]);
      if (r.weather === 'snow') expect(r.theatre).toBe('alpine');
      seen.add(JSON.stringify(r));
      expect(resolveRequest(explicit, seed)).toMatchObject({ theatre: 'rail', density: 'heavy', angle: 'defector' });
    }
    expect(seen.size).toBeGreaterThan(30);
    expect(resolveRequest(request(), 7)).toEqual(resolveRequest(request(), 7));
    expect(resolveRequest(request({ weather: 'snow' }), 3).theatre).toBe('alpine');
  });

  it('give every job its own prompt', () => {
    const prompts = new Set(Array.from({ length: 12 }, (_, i) => buildPrompt(resolveRequest(request(), i + 1), i + 1)));
    expect(prompts.size).toBe(12);
    const prompt = buildPrompt(request({ density: 'light', alarm: 'strict', objectives: '3', angle: 'prototype' }), 1);
    expect(prompt).toContain('density must be "light"');
    expect(prompt).toContain('failOnFullAlarm must be true');
    expect(prompt).toContain('exactly 3 objectives');
    expect(prompt).toContain('prototype device');
    expect(prompt).not.toMatch(/codename such as "Grey Lantern"/);
    expect(prompt).toMatch(/For inspiration/);
  });

  it('are honoured by plan checks and by the offline generator', () => {
    const req = request({ theatre: 'coastal', density: 'heavy', alarm: 'strict', objectives: '3' });
    const plan = missionPlanSchema.parse(examplePlan(req, 2));
    expect(planIssues(plan, req, 2)).toEqual([]);
    const issues = planIssues({ ...plan, density: 'light', failOnFullAlarm: false, objectives: plan.objectives.slice(0, 1) }, req, 2).join('\n');
    expect(issues).toMatch(/density must be heavy/);
    expect(issues).toMatch(/failOnFullAlarm must be true/);
    expect(issues).toMatch(/exactly 3 objectives/);
    for (const objectives of ['1', '2', '3'] as const) {
      const built = fallbackMission(request({ objectives, density: 'light', alarm: 'lenient' }), KEY, 11);
      expect(built.spec.objectives).toHaveLength(Number(objectives));
      expect(built.spec.objectives[0]!.required).toBe(true);
      expect(built.spec.density).toBe('light');
      expect(built.spec.failAtAlarm).toBeNull();
      const landing = built.spec.events.find((e) => e.id === 'landing');
      if (landing?.action.type === 'message') expect(landing.action.text).toContain(built.spec.objectives[0]!.title);
    }
    for (const focus of ['sabotage', 'steal', 'rescue'] as const) {
      const built = fallbackMission(request({ focus }), KEY, 21);
      const landing = built.spec.events.find((e) => e.id === 'landing');
      if (landing?.action.type === 'message') expect(landing.action.text, focus).toContain(built.spec.objectives[0]!.title);
    }
  });

  it('every offline mission validates for random requests', async () => {
    for (let seed = 1; seed <= 16; seed += 1) {
      const out = await generateMission({ request: resolveRequest(request(), seed * 31), key: KEY, seed: seed * 31, provider: disabledProvider });
      expect(out.report.validation.ok, `seed ${seed}`).toBe(true);
      expect(out.briefing.sceneDescription).toBeTruthy();
    }
  });
});

describe('dossier sketches', () => {
  it('are prompted from the operation and forbid text and real insignia', async () => {
    const out = await generateMission({ request: request({ theatre: 'rail', timeOfDay: 'night' }), key: KEY, seed: 3, provider: mock('valid', request({ theatre: 'rail', timeOfDay: 'night' })) });
    const prompt = dossierImagePrompt(out);
    expect(prompt).toContain(out.briefing.sceneDescription!);
    expect(prompt).toMatch(/night/);
    expect(prompt).toMatch(/No readable text/);
    expect(prompt).toMatch(/No flags, insignia/);
  });

  it('send the key only in the header and return the image bytes', async () => {
    const png = Buffer.from('fake-image');
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: png.toString('base64') } }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 1500 } }));
    }) as unknown as typeof fetch;
    const out = await geminiImageProvider({ apiKey: 'test-key-123', model: 'img', fetchImpl }).draw('a sketch');
    expect(out).toMatchObject({ mimeType: 'image/jpeg', inputTokens: 50, outputTokens: 1500 });
    expect(out.data.equals(png)).toBe(true);
    expect(seen!.url).not.toContain('test-key-123');
    expect((seen!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key-123');
  });

  it('fail cleanly when no image comes back', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'no' }] } }] }))) as unknown as typeof fetch;
    await expect(geminiImageProvider({ apiKey: 'k', model: 'img', fetchImpl }).draw('x')).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('generation pipeline', () => {
  it('builds a validated mission from a valid model answer', async () => {
    const stages: string[] = [];
    const out = await generateMission({ request: request({ theatre: 'alpine' }), key: KEY, seed: 3, provider: mock('valid', request({ theatre: 'alpine' })), onStage: (s) => void stages.push(s) });
    expect(out.source).toBe('mock');
    expect(out.report.fallbackReason).toBeNull();
    expect(out.report.validation.ok).toBe(true);
    expect(stages).toEqual(['drafting', 'validating', 'building']);
    expect(getTemplate(out.spec.templateId)?.theme).toBe('alpine');
    expect(generatedMissionSchema.parse({ key: KEY, source: out.source, spec: out.spec, briefing: out.briefing }).key).toBe(KEY);
  });

  it('is reproducible: the same answer and seed give the same level', async () => {
    const a = await generateMission({ request: request(), key: KEY, seed: 3, provider: mock('valid') });
    const b = await generateMission({ request: request(), key: KEY, seed: 3, provider: mock('valid') });
    expect(a.report.levelHash).toBe(b.report.levelHash);
    expect(a.spec).toEqual(b.spec);
  });

  it('repairs once when the first answer has a bad slot', async () => {
    const out = await generateMission({ request: request(), key: KEY, seed: 3, provider: mock('repairable') });
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
