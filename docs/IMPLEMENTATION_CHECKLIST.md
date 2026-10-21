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

## Art pass toward the approved concept ✅ (2026-10-15)

Requested after M2: the map and terrain should match the detailed concept `samples/images/env_coastal_night.jpg`.
Comparison sheet: `docs/art/art-pass-2026-10-15.jpg`. Decisions D25–D31.

- [x] 14 CC0 surface sets (Poly Haven), fetched and verified by `make textures`
- [x] World-space (triplanar) PBR materials with moss, macro variation and per-vertex tint; UV-mapped roof slabs
- [x] Splat-blended terrain (8 layers): triplanar rock on cliffs, wet shorelines, crag detail on cliff faces, diorama skirt
- [x] Faceted mossy rock outcrops on cliffs and cliff bases
- [x] Harbour: stone quay walls with coping, plank piers on braced posts, iron ladders, bollards
- [x] Buildings:
  - textured walls with plinths;
  - framed, shuttered windows;
  - door frames and steps;
  - tiled roofs with ridges and chimneys;
  - bunker slabs.
- [x] Fortifications: chain-link fences with barbed wire, sandbagged gun pits, braced watchtowers
- [x] Props:
  - barrels with hoops;
  - framed crates;
  - nets;
  - painted boats;
  - iron lamp posts with glowing lanterns;
  - field gun;
  - truck;
  - jagged pines;
  - grass tufts.
- [x] Water:
  - wave normals;
  - moon glints;
  - fresnel sheen;
  - depth tint;
  - shore foam;
  - translucent cut edge.
- [x] Lighting: brighter moonlit fill, lamp halos, soft searchlight beam
- [x] Post-processing (High preset): ambient occlusion, bloom, tilt-shift, vignette, ACES tone mapping
- [x] Generator v2: solid clutter along walls and the quay (mission validation still passes)
- [x] Turbopack dev cache disabled (fixed the dev reload loop for good)

### Verification (ran 2026-10-15)

| Check | Result |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ✅ |
| Unit tests | ✅ 80 / 80 (mission validation and objective chain re-checked with generator v2) |
| Browser tests vs. dev server and vs. production build | ✅ 10 / 10 each (Performance preset; see D31) |

**Not verified:** the frame rate of the High preset on a real GPU. Rendering on the SwiftShader software path says
nothing about it. Check with F3 in Chrome; if it is low, switch the pause-menu Graphics setting to Performance.

## Campaign and first-time tutorial ✅ (2026-10-15)

Decisions D32–D37.

- [x] Level kit and three new templates: Whitecrown Ridge (alpine, snow layer, gorge, bridge, radar plateau), Corvan Junction (rail yard, wagons, water tower), Boot Camp (training ground)
- [x] `MissionSpec` v1, compiler and validator, deterministic offline fallback generator
- [x] Four starting missions with briefings, one per hand-built map: Boot Camp, Silent Tide, White Silence, Iron Junction (Frozen Ledger and Last Light removed as map duplicates, D77)
- [x] Guided tutorial (15 steps): select, move, camera, group orders, view cones, crouch in grass, silent takedown, tie up, hide a body, lock-pick, steal, get past a fence, regroup, extract
- [x] Engine fixes: endless climb re-plan; fence orders cut where clicked

### Verification (ran 2026-10-15)

| Check | Result |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ✅ |
| Unit tests | ✅ 128 / 128 (each template validates across seeds; every campaign mission has a stealth route; the tutorial script played to extraction with 0 detections) |
| Browser tests vs. dev server | ✅ 15 / 15 (tutorial steps with real input; each new mission loads without console errors) |

## Milestone 3 — Mission generation ✅ (2026-10-15)

Decisions D38–D44.

- [x] Shared Zod contracts: generation request (enumerated choices plus an optional sanitized codename), model plan, stored spec and briefing, job DTO
- [x] `packages/ai`: providers `gemini` (Interactions API, 45 s timeout, 2 retries on 429/5xx, key only in a header and redacted from errors), `mock` (valid, malformed, repairable, invalid, unsafe, error), `disabled`
- [x] Prompt from the template catalog only; validation, one repair, content blocklist, offline fallback that honours the player's choices
- [x] Database: `missions`, `generation_jobs`, `ai_usage` (migration `0001_generated_operations`)
- [x] API: `POST /api/v1/generation-jobs` (Idempotency-Key, quotas, budget), `GET /:id`, `POST /:id/advance`, `POST /:id/cancel`; same-origin check, size limits, error envelope, owner-only (others get 404)
- [x] Generated Operation screen with real stage progress, cancel and "use the offline generator" at any time; briefing marks AI-drafted or offline; dashboard lists generated operations for replay
- [x] Generated missions play through the same compile path as the campaign (`op-<uuid>` keys)
- [x] Director deck of dynamic events for generated operations
- [ ] Runtime AI event proposals (plan §8.4): deferred, see D44

### Verification (ran 2026-10-15)

| Check | Result |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ✅ |
| Unit + integration tests | ✅ 152 / 152 (AI pipeline with every mock scenario, offline generator over many seeds and requests, provider retries and key redaction; job leases, idempotency, atomic completion, cancellation, ownership, spend tracking against Postgres) |
| Browser tests vs. dev server | ✅ 17 / 17 (request an operation in the UI, read the briefing, deploy into it; API idempotency, validation, cross-site refusal, other user gets 404, signed-out gets 401) |
| Live Gemini path | ✅ once from a script and once through the UI (2026-10-15): validated alpine rescue mission, no repair needed, about 13 s, about $0.0026 |

## Milestone 4 — Persistence and accounts ✅ (2026-10-15)

Decisions D45–D50.

- [x] Tables `campaigns`, `mission_runs`, `save_slots`, `save_revisions` (migration `0002_campaigns_and_saves`)
- [x] Campaign progression: best rank and score per mission, medals, flags, service records; active campaign created on first use; new campaign; difficulty; delete (audited)
- [x] Mission runs recorded from start to success, failure or abandonment
- [x] Saves: quick (F5/F9), auto (objective completed; every 5 minutes while calm), three manual slots in the pause menu; atomic, versioned (migration chain), checksummed, three revisions kept, damaged revisions recovered from the previous one; offline copy in IndexedDB
- [x] Field HQ: Continue from saves, campaign list with "Start here" for first-timers and ranks for completed missions
- [x] Settings synced to the account (graphics stay per device)
- [x] Account page with permanent deletion (cascade, cookies cleared, audited)
- [x] Ownership: every repository function scoped by the session's user; other users' ids return 404

### Verification (ran 2026-10-15)

| Check | Result |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ✅ |
| Unit + integration tests | ✅ 159 / 159 (adds concurrent campaign updates, single completion of runs, revision pruning, failed writes leaving the previous save, cross-user isolation, account deletion cascade) |
| Browser tests vs. dev server | ✅ 21 / 21 (quicksave and quickload restore the same moment; manual slot; Continue from Field HQ; saves private, validated and same-origin only; first-timer "Start here" and a recorded rank; settings round-trip; deletion needs confirmation) |
| Browser tests vs. production build (`make prod`, `make e2e-prod`) | ✅ 21 / 21 |

## Milestone 5 — Polish ✅ (2026-10-15)

Decisions D51–D56. The tutorial and missions 2–5 were delivered earlier (see "Campaign and first-time tutorial").

- [x] Planning mode: wait-for-signal orders, the signal, abort rules, timeline panel with durations, speed controls
- [x] Settings screen: graphics (preset, shadows, post-processing, resolution), audio, accessibility (interface size, subtitle size, colour-blind palette, noise rings, camera shake, edge scroll, mouse speed), key remapping with conflict detection; synced to the account except graphics
- [x] Voices: 21 new HQ lines for the campaign and the dynamic-event deck (`make voice-bank`, about $0.025)
- [x] Error and not-found pages
- [x] CSP with nonces, bundle secret scan, dependency audit clean
- [x] Real-GPU check in Chrome on the M5 Pro (below)

### Performance on the M5 Pro, real Chrome, High preset (2026-10-15)

Measured with `requestAnimationFrame` timing over 5–8 s in a visible, focused tab, at 1512×749 CSS px and devicePixelRatio 2. The display refreshes at 120 Hz, which caps the frame rate.

| Map | FPS | Median frame | 95th pct | Draw calls | Triangles | JS heap |
|---|---|---|---|---|---|---|
| White Silence (alpine, snow) | 120 | 8.3 ms | 8.5 ms | 225 | 0.67 M | 84 MB |
| Last Light (coastal, heavy garrison, fog), all view cones shown | 120 | 8.3 ms | 8.5 ms (99th: 10.0) | 244 | 0.71 M | 101 MB |
| Silent Tide (coastal night) | 120 | — | 8.9 ms | 320 | 0.71 M | — |

All within the High budgets (≤ 600 draw calls, ≤ 2 M triangles, ≤ 400 MB heap). Screenshots: `docs/perf/`. No console errors or CSP violations.
**Not measured:** low-end hardware (none available); the Performance preset is the fallback.

### Verification (ran 2026-10-15)

| Check | Result |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ✅ |
| Unit + integration tests | ✅ 164 / 164 (adds planning: synchronized start, second hold, abort if spotted, abort on alarm, plan survives save/load) |
| Browser tests vs. dev server | ✅ 23 / 23 (adds planning with real keys, key remapping with a refused conflict, palette and interface size) |
| Browser tests vs. production build | ✅ 23 / 23 with the strict production CSP |
| `make scan-bundle` / `make audit` | ✅ no secrets in 42 client files; no known vulnerabilities |

## Milestone 6 — Release readiness ✅ (2026-10-15)

- [x] Full test run on the final code (below)
- [x] Production build verified with the strict CSP (`make prod`, `make e2e-prod`)
- [x] Migrations verified fresh (integration `database.test.ts`) and as an upgrade from the first release with data (`upgrade.test.ts`)
- [x] End-to-end run with no AI key, from a clean `git clone` (no `.env`) under a fresh Compose project: `make up` healthy in 44 s (Docker image cached; new volumes), lint, typecheck, 165 / 165 tests and 23 / 23 browser tests passed, generated operations used the offline generator
- [x] Vercel configuration (`apps/web/vercel.json`: migrations run before the build) and production guide reviewed; **deployment itself not performed** (needs your accounts)
- [x] Documentation: README; architecture overview; game design; AI design; API; database; testing; security (threat model and checklist); production guide; troubleshooting; known limitations; roadmap; asset register; local guide
- [x] Fixes from the documentation review: a retried generation request returns its job before quota checks; sign-ins are audited

### Verification (ran 2026-10-15, final)

| Check | Result |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ✅ |
| Unit + integration tests | ✅ 165 / 165 |
| Browser tests vs. dev server | ✅ 23 / 23 |
| Browser tests vs. production build | ✅ 23 / 23 |
| Clean checkout, no AI key | ✅ (as above) |
| `make scan-bundle` | ✅ no secrets in 44 client files |
| `make audit` | ✅ no known vulnerabilities |
| Real-GPU check in Chrome (M5 Pro) | ✅ 120 FPS on the High preset on every map tried (see Milestone 5) |

See `docs/architecture/implementation-plan.md` §13.
