# Testing

All test commands run in Docker, like everything else (see [operations/local-development.md](operations/local-development.md)).
The host needs only Docker and `make`.

## Test layers

| Layer | Tool | Files | Needs |
|---|---|---|---|
| Unit | Vitest, project `unit` | `packages/*/src/**/*.test.ts`, `apps/web/src/**/*.test.ts` | Nothing (no database, no network) |
| Integration | Vitest, project `integration` | `tests/integration/**/*.test.ts` | The disposable test database |
| Browser (end-to-end) | Playwright, Chromium | `tests/browser/*.spec.ts` | A running app (dev server or production-like build) |
| Static checks | ESLint, `tsc` | Whole repository | Nothing |
| Security checks | Bundle scan, `pnpm audit` | Built bundle, dependency tree | A production build; registry access |

## Commands

| Target | Runs | Notes |
|---|---|---|
| `make test` | Compose service `test`: `pnpm test` (`vitest run`, both projects) | Starts `db` if needed |
| `make test-unit` | `pnpm test:unit` (`vitest run --project unit`) in `tools`, `--no-deps` | No database |
| `make test-integration` | `pnpm test:integration` (`vitest run --project integration`) in `tools` | Starts `db` if needed |
| `make e2e` | Compose service `e2e` (profile `e2e`) | Waits for `app` to be healthy; starts the stack if needed |
| `make e2e-prod` | Compose service `e2e-prod` (profiles `prod`, `e2e-prod`) | Builds and starts `app-prod`, then runs the same suite against it |
| `make lint` | `pnpm lint` (`eslint --max-warnings=0 .`) | Any warning fails |
| `make typecheck` | `pnpm typecheck`: every package, then `tests/tsconfig.json` and `tools/tsconfig.json` | |
| `make check` | `lint`, `typecheck`, `test` | |
| `make scan-bundle` | `make build`, then `tools/security/scan-bundle.ts` | See [Security checks](#security-checks) |
| `make audit` | `pnpm audit --prod` | Production dependencies only |

To run a single file or test, use the tools container:

```bash
docker compose run --rm --no-deps tools pnpm vitest run packages/engine/src/nav/pathfinder.test.ts
docker compose run --rm tools pnpm vitest run --project integration tests/integration/progress.test.ts
docker compose --profile e2e run --rm e2e node node_modules/@playwright/test/cli.js test tests/browser/saves.spec.ts
```

## Vitest configuration

`vitest.config.ts` defines two projects. Both run in the `node` environment and resolve `@` to `apps/web/src`.

- **`unit`**: runs in parallel.
- **`integration`**: `fileParallelism: false`, because all files share one database. Test timeout 30 s, hook
  timeout 60 s.

## The disposable test database

Integration tests use `TEST_DATABASE_URL`. Compose sets it to
`postgres://shadow:shadow@db:5432/operation_shadow_test`. That database is created once, when the Postgres volume is
first initialised, by `infra/docker/postgres/init/01-create-test-database.sql`. It is separate from the development
database (`operation_shadow`), so tests never touch local game data.

Each integration file refuses to run if `TEST_DATABASE_URL` is not set. `database.test.ts` and `upgrade.test.ts`
drop the `public` and `drizzle` schemas and recreate `public` before they start, then apply migrations with
`runMigrations`. `generation.test.ts` and `progress.test.ts` apply migrations (a no-op if already current) and
create fresh users with random ids. **Never point `TEST_DATABASE_URL` at a database whose data you want to keep.**

If you deleted the volume's test database by hand, `make reset` (which deletes all local data) recreates it on the
next `make up`.

## What each suite covers

### Unit tests

| File | Covers |
|---|---|
| `packages/engine/src/core/rng.test.ts` | Seeded RNG: same sequence per seed, serialise and restore, no all-zero state, float and integer ranges, deterministic shuffle |
| `packages/engine/src/nav/pathfinder.test.ts` | Pathfinding: walls, deep and shallow water, climb links, goals inside walls, unreachable areas, locked doors, no diagonal corner cutting, determinism |
| `packages/engine/src/sight/los.test.ts` | Line of sight: walls, low walls and stance, windows, hills, doors and smoke, vegetation; view-cone fans agree with the exact sight test |
| `packages/engine/src/sound/propagation.test.ts` | Sound: 6 dB per distance doubling, wall and door damping, low walls and fences, audible radius |
| `packages/engine/src/sim/scenarios.test.ts` | Simulation scenarios: detection zones, darkness, noise and distraction, disguise, abilities and their rules, takedowns, knockout and restraint, bodies and alerts, capture and rescue, bleed-out and revive, objectives and extraction, alarm-limit failure, replay determinism, save and restore |
| `packages/engine/src/sim/planning.test.ts` | Planning mode: held orders start on the same tick, a second hold waits for the next signal, "abort if spotted", "abort on alarm", a held plan survives save and load |
| `packages/engine/src/missions/compile.test.ts` | Each generator template (coastal, alpine, rail): same level per seed, advertised slots, valid offline missions over several seeds, every objective completable; training ground; spec checks; dynamic-event deck |
| `packages/content/src/missions/campaign.test.ts` | Every campaign mission validates with a stealth route, enforces its squad rules, and runs a guarded minute deterministically |
| `packages/content/src/missions/silent-tide.test.ts` | Silent Tide: deterministic level, validation, full objective chain, deterministic full run |
| `packages/ai/src/pipeline.test.ts` | Mission plans (schema, content checks, markup and blocklist); pipeline with each mock scenario (valid, repairable, malformed, invalid, unsafe, error) and the offline fallback; reproducibility; Gemini provider sends the key only in a header, retries overloads, never leaks the key in errors |
| `packages/schemas/src/api.test.ts` | Error envelope and its message cap; readiness response shape |
| `apps/web/src/server/dev-login.test.ts` | Dev login is enabled only in local and test environments, never on previews, refuses to run in production, only knows the seeded operators |
| `apps/web/src/game/input/context-action.test.ts` | Right-click context actions, ability targeting and the ability bar |
| `apps/web/src/game/tutorial/script.test.ts` | The Boot Camp tutorial script can be followed to the end without being spotted |

### Integration tests

These run the real repositories and migrations against Postgres.

| File | Covers |
|---|---|
| `tests/integration/database.test.ts` | Migrations create every table from empty, are idempotent, leave the database ready; readiness reports `pending` without migration history; preferences are owner-scoped, upsert, and cascade with the user |
| `tests/integration/generation.test.ts` | Generation jobs: idempotent per owner and key, one worker per lease and re-claimable after expiry, expire after too many attempts, invisible to other users, complete atomically exactly once, cancelled jobs store no mission, AI spend is tracked |
| `tests/integration/progress.test.ts` | Campaigns created on first use and private; concurrent progress updates all count; runs finish once and only for their owner; saves keep three revisions, are private, and a failed write leaves the previous save intact; account deletion removes everything the user owns and nothing else |
| `tests/integration/upgrade.test.ts` | A first-release database (migration 0000 only) with data upgrades to the current schema and keeps its data |

### Browser tests

| File | Covers |
|---|---|
| `foundation.spec.ts` | `/api/health` and `/api/ready`; signed-out redirect; dev sign-in, the 3D test range renders, sign-out; the second operator gets a separate session |
| `game.spec.ts` | Silent Tide: briefing and squad rules; invalid squad in the URL; selection, orders, tactical pause and menus; box selection and a thrown stone; view cones on hover, pin and Alt; a failed mission and its debrief |
| `campaign.spec.ts` | The tutorial with real input, step by step; each other campaign mission loads and runs without console errors |
| `planning.spec.ts` | Orders planned while paused start together on the signal; key remapping with a refused conflict |
| `operations.spec.ts` | Request an operation in the UI, read the briefing, deploy; jobs API: idempotency (202 then 200), validation (400), missing key (400), cross-site (403), another user gets 404 for the job and the briefing, signed-out gets 401 |
| `saves.spec.ts` | Quicksave and quickload, continue from Field HQ; saves private, validated and same-origin only; a fresh campaign and a recorded rank; settings sync, preferences size limits (400 and 413), account deletion needs `{"confirm":"DELETE"}` |

## How the browser tests run

### Playwright setup

`playwright.config.ts`:

- `testDir: tests/browser`; one worker, not fully parallel (tests share the seeded operators).
- Timeouts: 90 s per test, 20 s per assertion. One retry when `CI` is set (Compose sets `CI=true`).
- Base URL from `E2E_BASE_URL` (default `http://localhost:3000`).
- One project, Desktop Chrome at 1280×800, launched with `--use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist`.
- Traces and screenshots are kept for failures; the HTML report goes to `playwright-report/`.

The `e2e` and `e2e-prod` services use the official `mcr.microsoft.com/playwright:v1.64.0-noble` image. They share
the network namespace of `app` or `app-prod` (`network_mode: service:…`), so the browser reaches the app at
`http://localhost:3000` or `http://localhost:3001`. That is the origin the app is configured with, so Better Auth's
origin checks and the API's `Origin` check pass, and Chromium does not upgrade the requests to HTTPS. `e2e-prod` runs
the same suite against the standalone production build with its strict CSP.

Tests sign in through the dev login buttons ("Sign in as Test Operator A/B"). The `seed` step creates these
operators, so the stack must have been seeded (`make up` does this).

### Software WebGL and the Performance preset

The Playwright container has no GPU. WebGL runs on SwiftShader, a software renderer, at roughly 8–9 FPS in this
game. The browser tests therefore check behaviour, not frame rate.

Before signing in, specs that open the game write `{"quality":"low"}` to `localStorage` under
`operation-shadow:settings`. `low` is the preset shown as "Performance (30 FPS tier)" in the settings menu: no
shadows, no post-processing, resolution scale 1. This keeps software rendering fast enough for the simulation to
advance within the timeouts. Frame rate on a real GPU was measured separately (Milestone 5 in
[IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)).

### The `window.__OS_GAME__` probe

`apps/web/src/game/render/test-hooks.tsx` publishes a read-only object while a play session is mounted. The play
session always mounts it (`<GameScene … testHooks />` in `apps/web/src/game/play-session.tsx`), and it is removed
when the scene unmounts.

| Member | Returns |
|---|---|
| `probe()` | `GameProbe`: `tick`, `status` (`running`/`success`/`failed`), `paused`, `alarm`, `selected` ids, `conesVisible` (drawn view-cone meshes), and each operative's `id`, `role`, `x`, `z`, `status`, `stance`, `busy` |
| `screenOf(x, z)` | Screen pixel position of a world point (at terrain height), or `null` if off-screen |
| `entityScreen(id)` | Screen position of an operative, guard or object, or `null` |

The probe cannot issue orders or change state. Tests use it to wait until the game runs
(`probe().tick > 10`), to find where to click, and to check results. All game input comes from real mouse and
keyboard events through Playwright. The test-side type declaration is in `tests/browser/globals.d.ts`.

### Generation tests use the offline generator

`operations.spec.ts` uses the offline generator so the suite is deterministic and free. In the UI test it clicks
"use the offline generator" when that button is shown (without an AI key the main button already uses it). The API
test sends `offline: true`. The live model is never called from automated tests.

The model-dependent branches are covered by unit tests instead: `packages/ai/src/pipeline.test.ts` drives the
pipeline with every `mock` provider scenario and tests the Gemini provider's retries and key handling with a fake
`fetch`. For a manual check of the mock path in the running app, set `AI_PROVIDER=mock` and optionally
`AI_MOCK_SCENARIO` in `.env` (production refuses `mock`).

### Live Gemini verification

The live Gemini path was verified by hand, not by the test suite. Milestone 3 in
[IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) records it: once from a script and once through the UI on
2026-10-15. Both produced a validated alpine rescue mission with no repair needed, in about 13 s, for about
$0.0026. To repeat it, put `GOOGLE_API_KEY` in `.env`, run `make up`, request an operation from Field HQ without
choosing the offline generator, and check that the briefing marks it as AI-drafted.

## Security checks

- **`make scan-bundle`** builds the production bundle, then `tools/security/scan-bundle.ts` scans
  `apps/web/.next/static` for the values of `GOOGLE_API_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`,
  `DEV_LOGIN_PASSWORD`, `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (values of 8 characters or more), plus Google API
  key and password-bearing Postgres URL patterns. It prints only file names and which secret matched, never the
  value, and exits with code 1 on any finding.
- **`make audit`** runs `pnpm audit --prod` against the production dependency tree.

## Latest verified results

From the Milestone 5 verification table in [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) (run on
2026-10-15):

| Check | Result |
|---|---|
| `pnpm lint` / `pnpm typecheck` | Pass |
| Unit and integration tests (`make test`) | 164 / 164 |
| Browser tests against the dev server (`make e2e`) | 23 / 23 |
| Browser tests against the production build (`make e2e-prod`) | 23 / 23, with the strict production CSP |
| `make scan-bundle` / `make audit` | No secrets in 42 client files; no known vulnerabilities |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `TEST_DATABASE_URL must point at a disposable test database` | Run integration tests through `make test` or `make test-integration`, which set it |
| Integration tests cannot connect to `operation_shadow_test` | The database is created only on first volume initialisation. Create it in the `db` container, or `make reset` and `make up` |
| Browser tests time out waiting for `__OS_GAME__` | Check `make logs` for app errors; the first compile of a play page in the dev server can be slow |
| Dev sign-in fails in browser tests | Run `make seed` |
| `make e2e` cannot reach the app | Start the stack first (`make up`); `e2e` shares the `app` container's network |
