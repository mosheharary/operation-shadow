# Architecture overview

The full design and its rationale are in `implementation-plan.md` (approved plan) and `decision-log.md` (every
decision since). This page is the map.

```
Browser                                              Server (Next.js 16 on Node 24; Vercel in production)
┌──────────────────────────────────────────┐        ┌──────────────────────────────────────────────┐
│ React 19 pages (Field HQ, briefing, …)   │  HTTP  │ App Router pages (server components)          │
│ Game client  apps/web/src/game           │◄──────►│ /api/v1/* route handlers (Zod in and out)     │
│  ├ runtime: controller, persistence      │  JSON  │  ├ server/: api helpers, generation, saves,   │
│  ├ render: R3F scene, materials, post    │        │  │          progress, missions, session, env  │
│  ├ input, camera, hud, audio, tutorial   │        │  ├ Better Auth (Google; dev login locally)    │
│  └ engine (same package as the server)   │        │  └ packages/ai → Gemini Interactions API      │
└──────────────────────────────────────────┘        └───────────────┬──────────────────────────────┘
                                                                    │ pg pool (Drizzle)
                                                          PostgreSQL 18 (Docker locally, Neon in production)
```

## Packages (pnpm workspace)

| Package | Role | Depends on |
|---|---|---|
| `packages/engine` | Deterministic 20 Hz simulation: navigation, sight, sound, guards, abilities, objectives, alarm, director, scoring; level generators and templates; mission specs and the compiler/validator | nothing (pure TypeScript) |
| `packages/content` | Authored content: specialists, dialogue, ability texts, the campaign and tutorial, generated-mission entries | engine |
| `packages/schemas` | Zod contracts shared by server and client: API errors, generation, saves, progress, preferences | zod |
| `packages/ai` | Server-only mission generation: providers, prompt, validation, repair, offline fallback | engine, schemas |
| `packages/db` | Drizzle schema, SQL migrations, owner-scoped repositories, readiness | drizzle-orm, pg |
| `apps/web` | Next.js app: pages, API routes, the 3D game client | all of the above |

## Key flows

- **Playing a mission.** The play page resolves the mission (campaign by key, or the player's generated operation
  `op-<uuid>` from the database), validates the squad, and hands a `GameSetup` to the client. The client compiles the
  spec onto its template (deterministic level), creates the `World`, and drives it at 20 Hz from the render loop. The
  engine is the single source of truth; rendering interpolates between ticks.
- **Orders.** Input resolves a right-click into an engine `Command` (`input/context-action.ts`), which the engine
  validates and applies at the next tick boundary. Planning mode adds `hold`, `signal` and abort rules.
- **Saving.** `runtime/persistence.ts` snapshots the engine state, gzips it in the browser and `PUT`s it; the server
  validates, checksums and stores revisions. Loading restores the state with `World.restore`.
- **Generating.** `POST /api/v1/generation-jobs` → job row → `after()` runs `generateMission` (model or offline) →
  validated spec + briefing stored with the level hash → the client opens `/missions/op-<id>`.
- **Progress.** Each attempt is a `mission_runs` row; completion folds into the campaign's progress document.

## Determinism

All gameplay randomness comes from seeded xoshiro streams in the state (`core/rng.ts`); the director's deck has its own
stream. The state is plain JSON, hashed with `stateHash` in tests. Saves, restores and planning are covered by
scenario tests that compare hashes or positions with an uninterrupted run.

## Rendering

React Three Fiber 9 with three.js 0.186: triplanar CC0 materials, a splat-blended terrain, instanced props, a custom
water shader, cutaway roofs, view-cone fans and noise rings drawn from engine data, and (High preset) N8AO, bloom,
tilt-shift and ACES tone mapping. See `docs/art/` and decisions D25–D31, D55.

## Environments

Local: Docker Compose (`docs/operations/local-development.md`). Production: Vercel + Neon
(`docs/operations/production.md`). Security controls: `docs/security.md`.
