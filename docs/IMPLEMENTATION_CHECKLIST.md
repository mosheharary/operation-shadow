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

## Milestone 2 — Playable vertical slice ✅ (2026-10-15)

- [x] Headless engine (`packages/engine`):
  - 20 Hz fixed-step simulation with a seeded RNG and state hashing;
  - commands and events;
  - capability-aware A* navigation (climb and ladder links, swimming);
  - line of sight, light and concealment;
  - two-zone perception with suspicion thresholds and disguise rules;
  - sound propagation through walls, doors and terrain;
  - guard state machine (posts, patrols, investigation, search, challenge, capture and escort, revive, distraction);
  - alarm ladder with decay, bells, radio and reinforcements;
  - combat, injuries, bleed-out and capture;
  - 30 abilities across all six specialists through one validation pipeline;
  - objectives, extraction and failure;
  - scoring with medals, where kills never add points;
  - serializable state.
- [x] 25 deterministic gameplay scenario tests, plus navigation, sight, sound and RNG unit tests
- [x] Level generator v1: Coastal "Varrow Harbor" template, light baking, mission validator (stealth-route check), level hash
- [x] Content package: specialist profiles, ability texts, dialogue bank, authored mission 1 "Silent Tide" (23 guards, a hidden objective, director events)
- [x] Rendering:
  - terrain with baked light and a diorama skirt;
  - animated sea;
  - procedural buildings with roof cutaways;
  - instanced props and vegetation;
  - night lighting with pooled lamps, lanterns and a searchlight;
  - rain;
  - procedural characters;
  - effects.
- [x] Tactical overlay:
  - view cones (near/far, striped when alerted);
  - path preview;
  - noise rings;
  - footprints;
  - smoke;
  - objective markers;
  - extraction outline;
  - targeting range and noise previews.
- [x] Tactical camera (pan, 45° rotation, zoom, tilt, tracking, reset, terrain clearance, opening view toward the objective)
- [x] Input:
  - per-frame picking;
  - click, Shift and box selection;
  - number keys;
  - right-click context orders that are never lethal by default;
  - run and queue;
  - ability targeting;
  - stances;
  - tactical pause;
  - game speed;
  - a binding table ready for remapping.
- [x] HUD:
  - portraits with status chips;
  - alarm ladder;
  - objectives;
  - context hint;
  - ability bar;
  - minimap (click to look, right-click to move);
  - enemy info;
  - event log;
  - subtitles and toasts;
  - pause menu with settings;
  - controls overlay;
  - honest debrief with score and field report;
  - F3 frame-rate readout.
- [x] Pages: mission briefing with squad picker and difficulty; `/play/[key]` with server-side squad validation
- [x] Audio:
  - Web Audio buses with player volumes;
  - synthesised positional effects with wall occlusion;
  - weather and surf ambience;
  - siren;
  - adaptive music from the approved Lyria tracks;
  - a dialogue director with variety and priorities;
  - a 108-line Gemini TTS voice bank (`make voice-bank`, about $0.07).
- [x] Docs: README "How to play", local development (voice bank, troubleshooting), decision log D13–D24, asset register

### Verification (ran 2026-10-15 on Apple M5 Pro, Docker Desktop 29.8.2)

| Check | Result |
|---|---|
| `pnpm lint` | ✅ 0 problems |
| `pnpm typecheck` | ✅ all packages, tests and tools |
| Unit tests | ✅ 80 / 80 (engine, content, context actions, auth guard, schemas) |
| Integration tests (Postgres 18.6) | ✅ 7 / 7 |
| Browser tests vs. dev server (`make e2e`) | ✅ 10 / 10 |
| Browser tests vs. production build (`make e2e-prod`) | ✅ 10 / 10 |
| Production build (`next build`, standalone image) | ✅ |

**What the new browser tests check (real mouse and keyboard input, SwiftShader WebGL):**
- the briefing enforces squad rules and deploys;
- a bad squad in the URL is rejected with the reason;
- number-key selection, a right-click move, tactical pause, the pause menu and the controls overlay;
- box selection;
- aiming and throwing a stone, which uses one from the pouch;
- view cones on hover, on pin and for all soldiers with Alt;
- a squad that charges the garrison fails the mission, the debrief appears, and Retry restarts.

### Not yet verified, or deferred

- **Real-GPU frame rate:** not measured yet. The Chrome window was in the background, so the browser suspended
  rendering. SwiftShader software rendering runs at about 8–9 FPS with 230–490 draw calls and 116k–150k triangles,
  which says nothing about GPU speed. Check with F3 in Chrome; it is planned for the M5 performance pass.
- **Finishing every objective in the browser:** not automated. The engine test completes the whole objective chain
  (with guards removed) and validates a stealth route, but no browser test plays the mission to extraction.
- **Deferred to M5:**
  - boats and vehicles;
  - climbable watchtowers;
  - guard idle chatter (the lines exist in the voice bank);
  - the key-remapping screen;
  - planning mode;
  - authored character models.

## Milestones 3–6

See `docs/architecture/implementation-plan.md` §13.
