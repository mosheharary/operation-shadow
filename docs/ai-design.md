# AI design: generated operations

Google Gemini drafts missions on the server. The model never decides geometry or rules: it fills a small, validated plan
from a catalog, and a deterministic compiler turns that plan into a playable level. Everything degrades to an offline
generator, so the game never depends on the model being available, cheap or well-behaved.

Code: `packages/ai` (providers, prompt, validation, pipeline), `packages/schemas/src/mission.ts` (contracts),
`apps/web/src/server/generation.ts` and `apps/web/src/app/api/v1/generation-jobs` (jobs), `packages/engine/src/missions`
(spec, compiler, templates).

## What the model may choose

The plan (`missionPlanSchema`): codename, the job's own site (`site-<theatre>-<seed>`, laid out from the job seed before the prompt is written; the prompt lists only that site), time of day, weather, guard density, 1–3 objectives
(kind + a **named slot** from the template catalog, title, description, required, optional reveal time), up to 3 radio
lines with a time, whether full alert fails the mission, recommended specialists, and debrief lines.

It never chooses coordinates, the seed, squad rules, event mechanics or anything executable. The server derives:
coordinates (template slots), squad requirements (from objective kinds), standard events (completion message,
reinforcements at sector alert), the seed, and the dynamic-event deck.

## Prompt

`buildPrompt(request)` contains only: a fixed description of the fictional setting and its rules (no real countries,
armies, movements, people or symbols; no gore; plain text), the catalog of allowed templates with their slots, and the
player's enumerated choices. The only free text from the player is an optional codename restricted to letters, spaces,
apostrophes and hyphens (≤ 40 characters), validated before it reaches the prompt.

## Provider

`geminiProvider` calls the Interactions API (`POST /v1beta/interactions`) with `store: false`, the pinned model
(`GEMINI_TEXT_MODEL`, default `gemini-3.8-flash`) and structured output from `z.toJSONSchema(missionPlanSchema)`. If the
schema is refused (HTTP 400), it retries once with plain JSON instructions. Each attempt has a 45 s timeout; 429 and
5xx responses and network errors get at most 2 retries with exponential backoff. The key goes only in the
`x-goog-api-key` header and is redacted from any error text. `mock` (tests: valid, malformed, repairable, invalid,
unsafe, error) and `disabled` complete the set.

## Validation and repair

1. JSON parse (code fences tolerated).
2. Zod schema: strict objects, enums, length limits, plain text only (no markup, links or control characters).
3. Catalog and request checks (`planIssues`): template allowed by the request, time and weather honoured, snow only in
   the mountains, slots exist and match the objective kind, no slot used twice, at least one required objective,
   required objectives not hidden, the requested objective kind present.
4. Content blocklist (`textProblem`): real extremist names and symbols, slurs.
5. Spec checks (`specIssues`), then **level validation**: the compiled mission must have a route to every required
   objective and the extraction that no sentry can see, and the objective chain must be completable.

Steps 1–4 failing → one repair round, where the model sees its answer and the exact problems. Still failing, or any
provider error, or step 5 failing → the offline generator.

## Offline generator

`fallbackMission(request, key, seed)` picks an allowed template and builds a deterministic spec from the seed, honouring
the player's theatre, time, weather (snow becomes fog outside the mountains), objective type and codename. It is tested
across many seeds and requests; the pipeline also tries a few neighbouring seeds before giving up (it never has in
tests). The briefing says "Prepared by the offline generator".

## Jobs, cost and limits

- Jobs are idempotent per player (`Idempotency-Key`), started with `after()` and driven by the progress screen's
  `/advance` calls under a 150 s lease; a job abandoned three times fails. The mission and the job's `ready` stage are
  written in one transaction. See `docs/api.md`.
- Quotas: 20 jobs per player per 24 h, 2 in flight; a global monthly spend cap (`AI_MONTHLY_BUDGET_USD`, default $5)
  beyond which jobs use the offline generator.
- Every model call is recorded in `ai_usage` (tokens, estimated cost, latency, status).
- Measured on 2026-10-15: one `gemini-3.8-flash` call, about 580 input and 570 output tokens, about 13 s,
  about $0.0026, no repair needed.

## Stored result and reproducibility

The database stores the spec, briefing, generation report and level hash, not the level. Template + seed + spec
rebuild the identical level on the client (`levelHash` in tests). Generated missions are replayed from storage, never
regenerated.

## Build-time media

Voices (Gemini TTS), music (Lyria) and concept art were generated at build time and committed with their prompts and
costs (`docs/assets/asset-register.md`, `make voice-bank`). The game never calls an AI service from the browser.

## Not implemented

Runtime AI event proposals during a mission (plan §8.4) and AI-written debriefs (plan §8.5) are deferred; see
`docs/known-limitations.md` and decision D44.
