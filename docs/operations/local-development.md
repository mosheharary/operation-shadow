# Local development

Everything runs in Docker. The host needs only Docker Desktop (Compose v2+) and `make`; Node.js is not required.

## Services

| Service | Purpose | Port |
|---|---|---|
| `db` | PostgreSQL 18.6. Volume `pgdata` is mounted at `/var/lib/postgresql`; the first initialization also creates `operation_shadow_test` | `127.0.0.1:54329` |
| `migrate` | One-shot: applies SQL migrations (`packages/db/migrations`) | – |
| `seed` | One-shot: creates or updates the dev test operators | – |
| `app` | Next.js dev server with hot reload; source is bind-mounted | `127.0.0.1:4000` |
| `app-prod` (profile `prod`) | Production-like standalone image | `127.0.0.1:3001` |
| `tools` (profile `tools`) | One-off commands (`pnpm …`) | – |
| `test` (profile `test`) | Unit and integration tests | – |
| `e2e` / `e2e-prod` (profiles) | Playwright in the official image, sharing the app container's network | – |

**Startup order.** `db` must report healthy before `migrate` runs. `seed` waits for `migrate`, and `app` waits for
`seed`. `app` counts as healthy once `/api/health` responds.

## Everyday commands

```bash
make up            # build if needed, start db → migrate → seed → app, wait until healthy
make logs          # follow logs (Ctrl+C to stop following)
make ps            # service status
make down          # stop everything; the database volume is kept
```

**Running tests**

```bash
make lint typecheck
make test          # unit + integration (integration resets and migrates the *test* database only)
make e2e           # browser tests against the dev server
make e2e-prod      # browser tests against the production-like build (builds it first)
```

**Database**

```bash
make migrate       # apply pending migrations to the dev database
make seed          # (re)create the dev test operators
docker compose run --rm tools pnpm db:generate   # after editing packages/db/src/schema/*.ts
```

**Shell and one-off commands**

```bash
make shell         # bash in the tools container
docker compose run --rm --no-deps tools pnpm <script>
```

## Endpoints

- `GET /api/health`: liveness check. The process is up; the database is not touched.
- `GET /api/ready`: readiness check. Returns `200` when the database is reachable and every migration bundled with this
  build has been applied, otherwise `503`.

## Sign-in locally

- **Dev test login.** Compose sets `ALLOW_DEV_LOGIN=true` and `APP_ENV=local`, and `make up` runs the `seed` step,
  which creates two test operators: `operator.a@shadow.test` and `operator.b@shadow.test`. The sign-in page shows a
  button for each.
- **Google sign-in (optional).**
  1. Create an OAuth client in Google Cloud with the authorized redirect URI
     `http://localhost:4000/api/auth/callback/google`.
  2. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
  3. Run `make up` again.

## Environment

Compose provides working local defaults. Override any of them in `.env`; `.env.example` documents every variable.
`GOOGLE_API_KEY` in `.env` is passed to the app and tools containers and stays server-side.

## Dependencies

- **Adding or upgrading packages.** Run `pnpm` inside the tools container, for example
  `docker compose run --rm --no-deps tools pnpm --filter @operation-shadow/web add <pkg>@<exact-version>`. Commit the
  updated `pnpm-lock.yaml`.
- **Release age.** pnpm refuses versions published less than 7 days ago (`minimumReleaseAge` in
  `pnpm-workspace.yaml`). Pin an older version rather than adding an exclusion.
- **Install scripts.** Dependency install scripts are denied unless the package is listed under `allowBuilds`. Review
  a new entry before you add it.
- **Keeping containers in sync.** When the lockfile changes, the `node_modules` volume re-syncs automatically on the
  next container start (`infra/docker/dev-entrypoint.sh`).

## Build-time media

The voice bank (`apps/web/public/media/voice/`) is generated with Gemini TTS and committed, so the game runs without
an API key. To regenerate after changing dialogue text:

```bash
make voice-bank ARGS="--dry-run"   # lists missing or changed lines and the estimated cost
make voice-bank                    # generates only those lines (the media image adds ffmpeg)
```

The key is read from `GOOGLE_API_KEY` in `.env` and never printed. Unchanged lines are skipped.

Surface textures (`apps/web/public/media/textures/`) are CC0 sets from Poly Haven. `make textures` re-fetches any
missing set, verifies the MD5 sums Poly Haven publishes, and writes the source, authors and licence to the manifest.

## Reset and rebuild

```bash
make rebuild       # rebuild images without cache
make reset         # DANGER: deletes the database and dependency volumes (asks you to type "reset")
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/api/ready` returns 503 with `migrations: pending` | Run `make migrate` |
| Dev sign-in says "failed" | Run `make seed`, which re-syncs the operator passwords |
| Port 4000, 3001 or 54329 already in use | Stop the other process, or change the host port in `compose.yaml` |
| Browser tests can't reach the app | Start the stack first (`make up`). The `e2e` service shares the `app` container's network |
| Dependency errors after pulling changes | `docker compose run --rm tools true` re-syncs `node_modules`; `make rebuild` as a last resort |
| Pages reload over and over in dev (the log shows `GET /sign-in` many times a second) | Turbopack's persistent dev cache was stale. It is now disabled in `next.config.ts`; if it ever recurs, `docker compose stop app`, delete `apps/web/.next/dev`, then `make up` |
| The game is silent | Browsers start audio only after a click or key press in the page; check the volume sliders in the pause menu (Esc) |
| Low frame rate | Esc → Settings → Graphics: Performance (no shadows, 1× resolution). F3 shows the frame rate |
