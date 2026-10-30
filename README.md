# Operation Shadow

A browser-based 3D real-time tactical stealth game: command a seven-person special-operations squad behind enemy lines
in a fictional 1940s-inspired world. It is an original spiritual successor inspired by the gameplay principles of
classic squad-stealth games.

**Play it:** <https://operation-shadow-mu.vercel.app> (sign in with Google).

> **Status (2026-10-17).** A guided tutorial (*Boot Camp*) and a five-mission campaign across coastal, alpine and rail
> maps; generated operations drafted by Google Gemini with an offline fallback; planning mode; saves and campaign
> progress; full settings and key remapping. The world is rendered in detailed 3D with three.js: skinned, animated
> characters, authored CC0 models, image-based lighting, water reflections and cascaded shadows on the High preset,
> and a lighter procedural renderer on the Performance preset. Deployed to Vercel + Neon. See
> [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md) and the
> [decision log](docs/architecture/decision-log.md).

## Quick start (local, Docker only)

Requirements: Docker Desktop (Compose v2+) and `make`. No Node.js, Neon account or Google key is needed locally.

```bash
git clone https://github.com/mosheharary/operation-shadow.git
cd operation-shadow
make up        # Postgres 18 + migrations + seed + dev server → http://localhost:4000
make e2e       # browser tests against the running stack
make down      # stop (data is kept)
```

Open <http://localhost:4000> and choose **Sign in as Test Operator A**. That dev-only login exists only in local and
test environments. Production uses Google sign-in.

## How to play

**New to the game? Start with *Boot Camp*** (marked "Start here" in Field HQ): a guided exercise that teaches every
control one step at a time. Then play the campaign in order, or choose **Request a generated operation**. Field HQ's
theatre map charts the Northern Reach with every operation pinned where it happens, the course you have covered inked in
and the next target pulsing; point at a pin (or a mission in the list) to see its dossier and open the briefing. Each briefing
lists the required specialists; pick your squad and a difficulty, then deploy. The full design is in
[`docs/game-design.md`](docs/game-design.md).

| Input | Action |
|---|---|
| Left-click / Shift-click / drag | Select one / add to selection / box-select squad members (or press 1–6) |
| Right-click | Move, or the action shown under the cursor (open a door, knock out a sentry from behind, tie up, carry, resupply a teammate who is out of ammunition…) |
| Double right-click / Shift + right-click | Run / queue the order |
| Z · C · X | Stand · crouch · prone |
| R G V B Y H N J U K | The selected specialist's ability slots (shown on the bar); left-click a target (double-click to run there, e.g. a knife rush), right-click or Esc cancels |
| Space | Tactical pause (orders still work) |
| L · Enter | Planning: wait for the signal · give the signal (everyone waiting moves at once) |
| F5 · F9 | Quicksave · quickload (the mission menu has manual slots; Field HQ has Continue) |
| Backspace | Field recorder: wind the last minute back (← → to scrub, Enter resumes from there in tactical pause, Esc returns to now) |
| WASD / arrows · wheel or pinch | Pan · zoom (zoomed all the way out the whole map is in view) |
| Q / E (tap: 45°, hold: spin) · sideways trackpad swipe · Option/Alt + drag · middle drag | Turn the camera all the way round; drag also tilts |
| Click a soldier / hold Alt | Pin his view cone / show every view cone |
| F1 · F3 · Esc | Controls · frame-rate readout · mission menu (save/load, settings, key remapping, restart, exit) |

The control bar under the alarm indicator has buttons for pause, turning the camera, the mission menu and **exit
without saving** (it asks first). Every button in the HUD explains itself on hover.

A fresh mission opens on a short letterboxed insertion reel with the clock held: the whole map, the primary
objective, then down to the squad on its landing point. The end of a mission gets a closing shot and a verdict before
the debrief, which then plays over a slow orbit of the scene. Any key or click skips either.

A mistake need not end the attempt. The **field recorder** keeps the last minute of play, a frame every two seconds:
press Backspace (or the rewind button in the control bar, or **Wind back** on a failed mission's debrief) and the
scene turns to old film and winds back to just before the latest trouble began, with the sightings, alarms and
casualties that followed listed above a film strip of the frames. Scrub with ← →; the world itself shows each moment.
Enter plays on from there in tactical pause (what came after is erased), Esc returns to the present untouched. The
debrief counts how often the tape was wound back.

Stay out of the bright inner part of a view cone, keep to shadows and grass, hide bodies and tie up unconscious
sentries: they wake up. Noise rings on the ground show how far a sound carries.

## Graphics

Settings → Graphics has two presets, each adjustable:

| | **High** | **Performance** |
|---|---|---|
| Characters | Skinned Quaternius bodies animated from a shared clip library; uniforms painted in the shader, kit on the bones | Detailed procedural figures |
| Props, vegetation | Poly Haven models (crates, barrels, lamps, buoys, shrubs); card-built pines and oaks with wind sway | Procedural models; the same trees |
| Buildings, fortifications | Instanced façade kit (windows, shutters, stonework, gutters, chimneys), modelled doors, hessian sandbags, concertina wire, coastal guns | Same |
| Environment | Sky HDRI lighting, grass, 1K textures, terrain detail normals, water reflections, three cascaded sun shadows, ambient occlusion, bloom, tilt-shift | Single shadow map off by default, no post-processing |
| Budgets (opening view of Silent Tide) | ≈ 400 draw calls, 1.4–1.9 M triangles | ≈ 120 draw calls, 0.4 M triangles |

Authored models and the code that loads them download only when **Detailed models** is on; anything that fails to
load falls back to the procedural version. Visual test pages: `/test-range` (renderer), `/test-range/characters`
(every character in every pose, authored or procedural) and `/test-range/assets` (every authored prop beside its
fallback). Performance numbers: [`docs/perf/2026-10-17-gltf-world.md`](docs/perf/2026-10-17-gltf-world.md).

## Common commands

Run `make help` to list every command. Full guide: [`docs/operations/local-development.md`](docs/operations/local-development.md).

| Command | What it does |
|---|---|
| `make up` / `make down` | Start or stop the dev stack (`db`, `migrate`, `seed`, `app`) |
| `make logs` | Follow all service logs |
| `make migrate` / `make seed` | Apply migrations / seed the dev test operators |
| `make lint` / `make typecheck` | ESLint / TypeScript across the monorepo |
| `make test` / `make check` | Unit and integration tests (integration uses a separate test database) / lint + typecheck + tests |
| `make e2e` / `make e2e-prod` | Playwright browser tests against the dev server / the production build |
| `make prod` / `make prod-down` | Production-like standalone build on <http://localhost:3001> |
| `make textures` | Fetch the CC0 surface textures from Poly Haven (checksum-verified, 512 px + 1K colour; already committed) |
| `make hdri` | Fetch the CC0 sky HDRIs from Poly Haven (already committed) |
| `make models PACKS=~/Downloads` | Fetch and optimise the CC0 glTF models: Poly Haven directly, Quaternius character packs from the folder you downloaded them to (SHA-256-verified; the processed models are already committed) |
| `make voice-bank` | Generate missing or changed voice lines with Gemini TTS (needs `GOOGLE_API_KEY`; `ARGS="--dry-run"` previews the cost) |
| `make scan-bundle` / `make audit` | Scan the browser bundle for secrets / check dependencies for vulnerabilities |
| `make reset` | **Deletes all local data** (asks for confirmation first) |

To enable AI-drafted operations locally, put `GOOGLE_API_KEY=…` in `.env` (git-ignored, see
[`.env.example`](.env.example)) and run `make up`. Without it, the offline generator prepares every operation.

Rebuilding the character models needs the free Quaternius packs *Universal Base Characters* and *Universal Animation
Library* (Standard, CC0), downloaded by hand from quaternius.itch.io; the archives themselves are not in the
repository.

## Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, three.js 0.186 with React Three Fiber, drei and postprocessing,
  Zustand, Zod
- **3D assets:** glTF 2.0 with WebP textures, processed by glTF-Transform and meshoptimizer (no Draco or meshopt
  decoder at runtime, so no WebAssembly); CC0 sources only (Poly Haven, Quaternius), recorded in the
  [asset register](docs/assets/asset-register.md)
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
apps/web/              Next.js app: pages, API routes, game client
apps/web/src/game/     Game client: render/ (scene, characters, buildings, water, lighting), assets/ (model
                       loading), input/, camera/, hud/, audio/, runtime/
apps/web/public/media/ Committed media: models/, textures/, hdri/, music/, voice/, portraits/, briefing/
packages/engine/       Deterministic simulation: rules, navigation, perception, AI, level generation
packages/content/      Specialists, dialogue bank, abilities text and authored missions
packages/schemas/      Versioned Zod schemas and API contracts
packages/ai/           Server-only mission generation: Gemini provider, prompt, validation, offline fallback
packages/db/           Drizzle schema, SQL migrations, ownership-scoped repositories
tools/media/           Build-time media pipeline: glTF models, CC0 textures and HDRIs, voice bank
tools/samples/         Gemini sample generator used to approve art/music/dialogue direction
samples/               The approved art, music and dialogue samples (open samples/index.html)
tests/                 Integration and browser tests
infra/docker/          Dockerfile and Postgres init scripts (compose.yaml at the root)
docs/                  Research, architecture plan, operations guides, decision log, performance reports
```

## Documentation

- [Architecture overview](docs/architecture/overview.md) · [Implementation plan](docs/architecture/implementation-plan.md) · [Decision log](docs/architecture/decision-log.md)
- [Game design](docs/game-design.md) · [AI design](docs/ai-design.md)
- [API](docs/api.md) · [Database](docs/database.md) · [Testing](docs/testing.md) · [Security](docs/security.md)
- [Local development](docs/operations/local-development.md) · [Production (Vercel + Neon)](docs/operations/production.md) · [Troubleshooting](docs/operations/troubleshooting.md)
- [Performance report](docs/perf/2026-10-17-gltf-world.md) · [Asset register](docs/assets/asset-register.md)
- [Known limitations](docs/known-limitations.md) · [Roadmap](docs/roadmap.md)
- [Reference research](docs/research/reference-research.md) · [Technology landscape](docs/research/technology-landscape-2026-10.md)
- [Implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md)

## Security notes

- Secrets live in `.env` locally, which git ignores, and in Vercel project settings in production. They are never
  given a `NEXT_PUBLIC_` prefix. `.env.example` lists every variable with empty values.
- The dev test login refuses to start if enabled with `APP_ENV=production` or `VERCEL_ENV=production`.
- Server code validates every session against the database. The edge `proxy.ts` only performs a fast redirect and
  sets a per-request nonce Content-Security-Policy.
- `make scan-bundle` checks the client bundle for secret values before release.
