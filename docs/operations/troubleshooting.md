# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `make up` hangs at "Waiting" for `app` | First start installs dependencies and compiles | Wait (a few minutes on first run); `make logs` shows progress |
| Dev server says `pnpm-lock.yaml changed; installing dependencies` and fails with `ERR_PNPM_OUTDATED_LOCKFILE` | A `package.json` changed without the lockfile | `docker compose run --rm --no-deps --entrypoint "" tools pnpm install --no-frozen-lockfile`, then commit the lockfile |
| Browser keeps reloading in dev ("HMR hash mismatch") | Stale Turbopack persistent cache on the bind mount | Already disabled (D25); if it returns, `make down && make up` |
| `/api/ready` returns `503` with `migrations: pending` | New migrations not applied | `make migrate` |
| Port 3000, 3001 or 54329 already in use | Another stack or service | Stop it, or `make down` in the other checkout |
| Sign-in page shows no "Sign in as Test Operator" buttons | Dev login is off | Locally it needs `APP_ENV=local` and `ALLOW_DEV_LOGIN=true` (Compose sets both); it is never available in production |
| "Request operation" always says offline generator | No `GOOGLE_API_KEY`, `AI_PROVIDER=disabled`, or the monthly budget is used | Put the key in `.env` (never commit it) and `make up`; check spend in `ai_usage` |
| `429` "Daily limit for new operations reached" | Per-player quota (`AI_DAILY_JOBS_PER_USER`) | Wait 24 h, raise the limit (local default 500), or replay an existing operation |
| Generation progress stays on one stage | The worker was stopped mid-job | The progress screen re-drives it after the 150 s lease; or choose "Use the offline generator instead" |
| Game is slow or the fan spins | High preset on a weaker GPU | Pause menu → Settings → Graphics → Performance; F3 shows the frame rate |
| Browser tests time out on the 3D scene | Software WebGL is slow | Tests already use the Performance preset (D31); make sure no other heavy container is running |
| "Saved on this device" toast | The save upload failed (offline) | It uploads automatically on the next game session |
| "Loaded an earlier copy" toast | The newest save revision was damaged | Nothing to do; the previous revision was used |
| `make voice-bank` or `make textures` fails | Needs network (and `GOOGLE_API_KEY` for voices) | Check `.env`; these are build-time tools, the committed media already work |
| A CSP violation appears in the console | A new script or resource outside the policy | Adjust `contentSecurityPolicy` in `apps/web/src/proxy.ts`; never add `unsafe-inline` to `script-src` |
