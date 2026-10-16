# Operation Shadow

A browser-based 3D real-time tactical stealth game: command a six-person special-operations squad behind enemy lines
in a fictional 1940s-inspired world. It is an original spiritual successor inspired by the gameplay principles of
classic squad-stealth games.

> **Status: all six milestones delivered (2026-10-15).** A guided tutorial (*Boot Camp*) and a five-mission campaign
> across coastal, alpine and rail maps; generated operations drafted by Google Gemini with an offline fallback;
> planning mode; saves and campaign progress; full settings and key remapping. Deployed to Vercel + Neon at
> <https://operation-shadow-mu.vercel.app> (Google sign-in still to be configured). See [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md).

## Quick start (local, Docker only)

Requirements: Docker Desktop (Compose v2+) and `make`. No Node.js, Neon account or Google key is needed locally.

```bash
make up        # Postgres 18 + migrations + seed + dev server → http://localhost:3000
make e2e       # browser tests against the running stack
make down      # stop (data is kept)
```

Open <http://localhost:3000> and choose **Sign in as Test Operator A**. That dev-only login exists only in local and
test environments. Production uses Google sign-in.

## How to play

**New to the game? Start with *Boot Camp*** (marked "Start here" in Field HQ): a guided exercise that teaches every
control one step at a time. Then play the campaign in order, or choose **Request a generated operation**. Each briefing
lists the required specialists; pick your squad and a difficulty, then deploy. The full design is in
[`docs/game-design.md`](docs/game-design.md).

| Input | Action |
|---|---|
| Left-click / Shift-click / drag | Select one / add to selection / box-select squad members (or press 1–6) |
| Right-click | Move, or the action shown under the cursor (open a door, knock out a sentry from behind, tie up, carry…) |
| Double right-click / Shift + right-click | Run / queue the order |
| Z · C · X | Stand · crouch · prone |
| R G V B Y H N J U K | The selected specialist's ability slots (shown on the bar); left-click a target, right-click or Esc cancels |
| Space | Tactical pause (orders still work) |
| L · Enter | Planning: wait for the signal · give the signal (everyone waiting moves at once) |
| F5 · F9 | Quicksave · quickload (the pause menu has manual slots; Field HQ has Continue) |
| WASD / arrows, Q/E, wheel, middle-drag | Pan, rotate 45°, zoom, free rotate |
| Click a soldier / hold Alt | Pin his view cone / show every cone |
| F1 · F3 · Esc | Controls · frame-rate readout · pause menu (save/load, settings, key remapping, restart) |

Stay out of the bright inner part of a view cone, keep to shadows and grass, hide bodies and tie up unconscious
sentries: they wake up. Noise rings on the ground show how far a sound carries.

Run `make help` to list every command. Full guide: [`docs/operations/local-development.md`](docs/operations/local-development.md).

## Common commands

| Command | What it does |
|---|---|
| `make up` / `make down` | Start or stop the dev stack (`db`, `migrate`, `seed`, `app`) |
| `make logs` | Follow all service logs |
| `make migrate` / `make seed` | Apply migrations / seed the dev test operators |
| `make lint` / `make typecheck` | ESLint / TypeScript across the monorepo |
| `make test` | Unit and integration tests (integration uses a separate test database) |
| `make e2e` / `make e2e-prod` | Playwright browser tests against the dev server / the production build |
| `make prod` | Production-like standalone build on <http://localhost:3001> |
| `make voice-bank` | Generate missing or changed voice lines with Gemini TTS (needs `GOOGLE_API_KEY`; `ARGS="--dry-run"` previews the cost) |
| `make textures` | Fetch the CC0 surface textures from Poly Haven (checksum-verified; already committed) |
| `make scan-bundle` / `make audit` | Scan the browser bundle for secrets / check dependencies for vulnerabilities |
| `make reset` | **Deletes all local data** (asks for confirmation first) |

To enable AI-drafted operations locally, put `GOOGLE_API_KEY=…` in `.env` (git-ignored) and run `make up`. Without it,
the offline generator prepares every operation.

## Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, three.js with React Three Fiber, Zustand, Zod
- **Data:** PostgreSQL 18 with Drizzle ORM via `pg`. The same code and migrations run locally and on Neon.
- **Auth:** Better Auth, self-hosted in the app (Google sign-in in production; dev test login locally)
- **AI:** Google Gemini, server-side only
  - runtime: mission generation (text), with validation, one repair and an offline fallback
  - build time: art, music and voice assets
- **Tooling:** pnpm 12 workspaces, TypeScript 6, Vitest 5, Playwright 1.64, all running in Docker
- **Supply chain:** pnpm only installs package versions that are at least 7 days old, and dependency install scripts
  are deny-by-default with a reviewed allowlist.

## Repository layout

```
apps/web/            Next.js app: pages, API routes, game client (render, input, audio, HUD)
packages/engine/     Deterministic simulation: rules, navigation, perception, AI, level generation
packages/content/    Specialists, dialogue bank, abilities text and authored missions
packages/schemas/    Versioned Zod schemas and API contracts
packages/ai/         Server-only mission generation: Gemini provider, prompt, validation, offline fallback
packages/db/         Drizzle schema, SQL migrations, ownership-scoped repositories
tools/samples/       Gemini sample generator used to approve art/music/dialogue direction
tools/media/         Build-time media pipeline (voice bank, CC0 textures)
samples/             The approved art, music and dialogue samples (open samples/index.html)
tests/               Integration and browser tests
infra/docker/        Dockerfile and Postgres init scripts (compose.yaml at the root)
docs/                Research, architecture plan, operations guides, decision log
```

## Documentation

- [Architecture overview](docs/architecture/overview.md) · [Implementation plan](docs/architecture/implementation-plan.md) (approved 2026-10-15) · [Decision log](docs/architecture/decision-log.md)
- [Game design](docs/game-design.md) · [AI design](docs/ai-design.md)
- [API](docs/api.md) · [Database](docs/database.md) · [Testing](docs/testing.md) · [Security](docs/security.md)
- [Production (Vercel + Neon)](docs/operations/production.md) · [Troubleshooting](docs/operations/troubleshooting.md)
- [Known limitations](docs/known-limitations.md) · [Roadmap](docs/roadmap.md)
- [Reference research](docs/research/reference-research.md) · [Technology landscape](docs/research/technology-landscape-2026-10.md)
- [Local development](docs/operations/local-development.md)
- [Asset register](docs/assets/asset-register.md)
- [Implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md)

## Security notes

- Secrets live in `.env` locally, which git ignores, and in Vercel project settings in production. They are never
  given a `NEXT_PUBLIC_` prefix.
- The dev test login refuses to start if enabled with `APP_ENV=production` or `VERCEL_ENV=production`.
- Server code validates every session against the database. The edge `proxy.ts` only performs a fast redirect.
