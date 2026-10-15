# Operation Shadow

A browser-based 3D real-time tactical stealth game: command a six-person special-operations squad behind enemy lines
in a fictional 1940s-inspired world. It is an original spiritual successor inspired by the gameplay principles of
classic squad-stealth games.

> **Status: Milestone 1 (Foundation) complete.** Accounts, database, Docker workflow and the 3D rendering pipeline
> work end to end. The playable vertical slice is Milestone 2. See
> [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md).

## Quick start (local, Docker only)

Requirements: Docker Desktop (Compose v2+) and `make`. No Node.js, Neon account or Google key is needed locally.

```bash
make up        # Postgres 18 + migrations + seed + dev server → http://localhost:3000
make e2e       # browser tests against the running stack
make down      # stop (data is kept)
```

Open <http://localhost:3000> and choose **Sign in as Test Operator A**. That dev-only login exists only in local and
test environments. Production uses Google sign-in.

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
| `make reset` | **Deletes all local data** (asks for confirmation first) |

## Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, three.js with React Three Fiber, Zustand, Zod
- **Data:** PostgreSQL 18 with Drizzle ORM via `pg`. The same code and migrations run locally and on Neon.
- **Auth:** Better Auth, self-hosted in the app (Google sign-in in production; dev test login locally)
- **AI:** Google Gemini, server-side only
  - runtime: mission generation and events (text)
  - build time: art, music and voice assets
- **Tooling:** pnpm 12 workspaces, TypeScript 6, Vitest 5, Playwright 1.64, all running in Docker
- **Supply chain:** pnpm only installs package versions that are at least 7 days old, and dependency install scripts
  are deny-by-default with a reviewed allowlist.

## Repository layout

```
apps/web/            Next.js app: pages, API routes, game client (render, input, audio, UI)
packages/engine/     Deterministic simulation: rules, navigation, perception, AI, missions
packages/schemas/    Versioned Zod schemas and API contracts
packages/db/         Drizzle schema, SQL migrations, ownership-scoped repositories
tools/samples/       Gemini sample generator used to approve art/music/dialogue direction
samples/             The approved art, music and dialogue samples (open samples/index.html)
tests/               Integration and browser tests
infra/docker/        Dockerfile and Postgres init scripts (compose.yaml at the root)
docs/                Research, architecture plan, operations guides, decision log
```

## Documentation

- [Architecture & implementation plan](docs/architecture/implementation-plan.md) (approved 2026-10-15)
- [Decision log](docs/architecture/decision-log.md)
- [Reference research](docs/research/reference-research.md) · [Technology landscape](docs/research/technology-landscape-2026-10.md)
- [Local development](docs/operations/local-development.md)
- [Asset register](docs/assets/asset-register.md)
- [Implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md)

## Security notes

- Secrets live in `.env` locally, which git ignores, and in Vercel project settings in production. They are never
  given a `NEXT_PUBLIC_` prefix.
- The dev test login refuses to start if enabled with `APP_ENV=production` or `VERCEL_ENV=production`.
- Server code validates every session against the database. The edge `proxy.ts` only performs a fast redirect.
