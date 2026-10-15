/**
 * Model providers for mission plans. Only `gemini` talks to the network; `mock` serves fixtures for
 * tests and `disabled` makes every job use the offline generator.
 */

export type ProviderId = 'gemini' | 'mock' | 'disabled';

export interface ModelCall {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface MissionPlanProvider {
  readonly id: ProviderId;
  readonly model: string;
  /** Returns the model's raw text. Throws ProviderError on failure. */
  generate(prompt: string, jsonSchema: Record<string, unknown>, signal?: AbortSignal): Promise<ModelCall>;
}

/** A provider failure with a message that is safe to store and show (never contains the key). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'timeout' | 'rate-limited' | 'server' | 'rejected' | 'network',
    readonly attempts = 1,
    readonly usage: ModelCall[] = [],
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const disabledProvider: MissionPlanProvider = {
  id: 'disabled',
  model: 'offline',
  generate() {
    return Promise.reject(new ProviderError('AI generation is not configured', 'unavailable'));
  },
};

// ── Gemini (Interactions API) ──────────────────────────────────────────────────────────────────

const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Per-attempt timeout (plan §8.3: 45 s). */
  timeoutMs?: number;
  /** Retries after the first attempt for 429/5xx and network errors (plan §8.3: at most 2). */
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Text blocks of an Interactions response, skipping thoughts and echoed input. */
export function interactionText(root: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown, step: string | null): void => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n, step);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const isStep = typeof obj.type === 'string' && (Array.isArray(obj.content) || Array.isArray(obj.summary));
    const current = isStep ? (obj.type as string) : step;
    if (obj.type === 'text' && typeof obj.text === 'string') {
      if (!/thought|user_input/i.test(current ?? '')) parts.push(obj.text);
      return;
    }
    for (const value of Object.values(obj)) walk(value, current);
  };
  walk(root, null);
  return parts.join('\n').trim();
}

export function geminiProvider(options: GeminiOptions): MissionPlanProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? 45_000;
  const retries = options.retries ?? 2;
  const redact = (text: string) => (options.apiKey ? text.split(options.apiKey).join('[redacted]') : text);

  async function call(body: Record<string, unknown>, signal: AbortSignal | undefined): Promise<ModelCall> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const started = Date.now();
      const timeout = AbortSignal.timeout(timeoutMs);
      let res: Response;
      try {
        res = await doFetch(INTERACTIONS_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify(body),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (err) {
        const timedOut = timeout.aborted;
        if (signal?.aborted) throw new ProviderError('Generation was cancelled', 'network', attempt);
        if (attempt <= retries) {
          await sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        throw new ProviderError(timedOut ? 'The model did not answer in time' : `Network error: ${redact((err as Error).message).slice(0, 120)}`, timedOut ? 'timeout' : 'network', attempt);
      }
      const raw = await res.text();
      if (!res.ok) {
        if (RETRYABLE.has(res.status) && attempt <= retries) {
          await sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        let detail = '';
        try {
          detail = String((JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? '');
        } catch {
          // not JSON
        }
        const kind = res.status === 429 ? 'rate-limited' : res.status >= 500 ? 'server' : 'rejected';
        throw new ProviderError(`Model request failed (HTTP ${res.status})${detail ? `: ${redact(detail).slice(0, 160)}` : ''}`, kind, attempt);
      }
      let json: { usage?: Record<string, number> };
      try {
        json = JSON.parse(raw) as typeof json;
      } catch {
        throw new ProviderError('The model response was not JSON', 'server', attempt);
      }
      return {
        text: interactionText(json),
        model: options.model,
        inputTokens: json.usage?.total_input_tokens ?? 0,
        outputTokens: json.usage?.total_output_tokens ?? 0,
        latencyMs: Date.now() - started,
      };
    }
  }

  return {
    id: 'gemini',
    model: options.model,
    async generate(prompt, jsonSchema, signal) {
      // store: false keeps requests out of the Interactions history (stateless generation).
      const structured = { model: options.model, input: prompt, response_format: { type: 'text', mime_type: 'application/json', schema: jsonSchema }, store: false };
      try {
        return await call(structured, signal);
      } catch (err) {
        // Some schema features may be refused; plain JSON instructions are validated the same way.
        if (err instanceof ProviderError && err.kind === 'rejected') {
          return call({ model: options.model, input: `${prompt}\n\nReturn ONLY the JSON object, with no code fences.`, store: false }, signal);
        }
        throw err;
      }
    },
  };
}

// ── Mock (tests and offline development) ───────────────────────────────────────────────────────

export type MockScenario = 'valid' | 'malformed' | 'repairable' | 'invalid' | 'error' | 'unsafe';

/**
 * Serves canned answers. `valid` returns `validPlan()`; `repairable` returns a plan with a bad slot
 * first and the valid one when asked to repair; `invalid` never validates; `malformed` is not JSON;
 * `unsafe` contains a link; `error` fails like an overloaded server.
 */
export function mockProvider(scenario: MockScenario, validPlan: (prompt: string) => unknown): MissionPlanProvider {
  let calls = 0;
  const answer = (text: string): ModelCall => ({ text, model: 'mock', inputTokens: 1200, outputTokens: 600, latencyMs: 5 });
  return {
    id: 'mock',
    model: 'mock',
    generate(prompt) {
      calls += 1;
      const plan = validPlan(prompt) as Record<string, unknown>;
      switch (scenario) {
        case 'valid':
          return Promise.resolve(answer(JSON.stringify(plan)));
        case 'malformed':
          return Promise.resolve(answer('{"codename": "Broken'));
        case 'repairable': {
          if (calls > 1) return Promise.resolve(answer(JSON.stringify(plan)));
          const objectives = (plan.objectives as Record<string, unknown>[]).map((o, i) => (i === 0 ? { ...o, slot: 'no-such-slot' } : o));
          return Promise.resolve(answer(JSON.stringify({ ...plan, objectives })));
        }
        case 'invalid':
          return Promise.resolve(answer(JSON.stringify({ ...plan, objectives: [] })));
        case 'unsafe':
          return Promise.resolve(answer(JSON.stringify({ ...plan, premise: ['Read the orders at https://example.com before you land.'] })));
        case 'error':
          return Promise.reject(new ProviderError('Model request failed (HTTP 503)', 'server', 3));
      }
    },
  };
}
