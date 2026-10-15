# Implementation checklist (living)

Updated at the end of every milestone. Only results that actually ran are recorded.

## Milestone 1 — Foundation ✅ (2026-10-15)

- [x] Local git repository; `.env` ignored before the first commit
- [x] pnpm 12 monorepo (`apps/web`, `packages/engine`, `packages/schemas`, `packages/db`) with locked versions, all at least 7 days old
- [x] Docker: dev/tools image, production standalone image, Compose stack (`db`, `migrate`, `seed`, `app`, `app-prod`, `test`, `e2e`, `e2e-prod`), health checks, named volumes
- [x] Makefile workflow (`up`, `down`, `logs`, `migrate`, `seed`, `lint`, `typecheck`, `test`, `e2e`, `e2e-prod`, `prod`, `rebuild`, `reset` with confirmation)
- [x] PostgreSQL 18.6 with the Drizzle schema v1 and the first SQL migration:
  - auth tables: user, session, account, verification, rate_limit
  - app tables: user_preferences, audit_events
- [x] Better Auth: Google sign-in when configured; dev test-operator login, with a production lock covered by unit tests; DB-backed sessions and rate limits
- [x] `/api/health` (liveness) and `/api/ready` (database and migration readiness)
- [x] App shell: sign-in, Field HQ dashboard (shows only built features), 3D test range with a live performance readout
- [x] Security headers; `X-Powered-By` removed; secrets server-only; lazy env validation
- [x] `.env.example`, README, local development guide, decision log, asset register

### Verification (ran 2026-10-15 on Apple M5 Pro, Docker Desktop 29.8.2)

| Check | Result |
|---|---|
| `pnpm lint` | ✅ 0 problems |
| `pnpm typecheck` | ✅ all packages + tests |
| Unit tests (`vitest --project unit`) | ✅ 15 / 15 |
| Integration tests (`vitest --project integration`, Postgres 18.6) | ✅ 7 / 7 |
| Browser tests vs. dev server (`make e2e`) | ✅ 4 / 4 |
| Browser tests vs. production build (`make e2e-prod`) | ✅ 4 / 4 |
| Production build (`next build`, standalone image) | ✅ |

**What the browser tests check:**
- health and readiness endpoints;
- signed-out visitors are redirected to sign-in;
- dev sign-in leads to the dashboard;
- the 3D test range renders real frames (more than 20 frames, draw calls above 0, more than 1,000 triangles via SwiftShader);
- sign-out works;
- each operator gets a separate session.

## Milestone 2 — Playable vertical slice (next)

- [ ] Headless engine:
  - fixed-step simulation;
  - commands and events;
  - capability-aware navigation;
  - LOS, light and concealment;
  - perception and suspicion;
  - sound propagation;
  - guard state machine;
  - alarm ladder;
  - combat and casualties;
  - ability framework with all six specialists;
  - objectives, extraction and failure;
  - scoring;
  - serialization.
- [ ] Deterministic gameplay scenario tests (the plan's §12 list)
- [ ] Level generator v1 + Coastal template + authored mission 1 ("Silent Tide") + validator
- [ ] Rendering:
  - terrain and water;
  - procedural buildings and props;
  - vegetation;
  - lighting;
  - characters;
  - tactical overlay;
  - cutaways.
- [ ] Tactical camera, selection, orders, path preview, ability targeting
- [ ] HUD v1, briefing and debrief screens, basic audio
- [ ] Browser test: start mission, select, move, complete objectives

## Milestones 3–6

See `docs/architecture/implementation-plan.md` §13.
