# Production: Vercel + Neon

The same code runs locally (Docker) and on Vercel. This guide lists every step to put it in production. It has been
checked as far as possible locally (production build, strict CSP, browser tests against the production image); an actual
Vercel deployment has **not** been made, because it needs your Vercel, Neon and Google accounts.

## 1. Neon (PostgreSQL)

1. Create a Neon project (PostgreSQL 18, region close to your Vercel region).
2. Note two connection strings for the main branch:
   - **pooled** (host contains `-pooler`): used by the app at runtime, as `DATABASE_URL`;
   - **direct**: used only by migrations, as `DATABASE_URL_UNPOOLED`.
   Both need `sslmode=require`.
3. Recommended: install the Neon integration in Vercel so every preview deployment gets its own database branch with
   both variables set automatically.

## 2. Google sign-in (OAuth)

1. In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** of type *Web application*.
2. Authorized JavaScript origin: `https://<your-domain>`.
3. Authorized redirect URI: `https://<your-domain>/api/auth/callback/google`.
4. Keep the client ID and secret for step 4. Previews on other domains need their own redirect URIs if you want
   Google sign-in there (dev login is never available on Vercel).

## 3. Vercel project

1. Import the repository. Set **Root Directory** to `apps/web`; the framework is detected as Next.js.
2. `apps/web/vercel.json` sets:
   - install: `pnpm install --frozen-lockfile` (pnpm 12, from `packageManager`);
   - build: `pnpm --filter @operation-shadow/db migrate && pnpm build`, so migrations run first, against
     `DATABASE_URL_UNPOOLED`. A failed migration fails the deployment, and the previous deployment keeps serving.
3. Node.js version: 24.x (from `engines`). Fluid compute: on (default).

## 4. Environment variables

Set these in Vercel → Settings → Environment Variables. **None of the secrets may be prefixed `NEXT_PUBLIC_`.**

| Variable | Production | Preview | Notes |
|---|---|---|---|
| `APP_ENV` | `production` | `preview` | Dev login refuses to start in production and stays off on previews |
| `DATABASE_URL` | pooled URL | branch pooled URL | Secret |
| `DATABASE_URL_UNPOOLED` | direct URL | branch direct URL | Secret; migrations only |
| `BETTER_AUTH_SECRET` | 32+ random chars (`openssl rand -base64 32`) | different value | Secret |
| `BETTER_AUTH_URL` | `https://<your-domain>` | the preview URL | Cookies become `Secure` on https |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` | the preview URL | Public |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from step 2 | optional | Secret (the secret) |
| `GOOGLE_API_KEY` | optional | optional | Secret. Without it, operations use the offline generator |
| `AI_PROVIDER` | unset (or `disabled`) | unset | `mock` is refused in production |
| `GEMINI_TEXT_MODEL` | `gemini-3.8-flash` | same | Pinned model id |
| `AI_MONTHLY_BUDGET_USD` | e.g. `5` | lower, e.g. `1` | Global estimated spend cap per calendar month (UTC) |
| `AI_DAILY_JOBS_PER_USER` | `20` | `20` | Generated operations per player per 24 h |

**Never set** `ALLOW_DEV_LOGIN` or `DEV_LOGIN_PASSWORD` on Vercel. If `ALLOW_DEV_LOGIN=true` reaches production,
the server refuses to start (tested in `apps/web/src/server/dev-login.test.ts`).

## 5. Health checks and monitoring

- `GET /api/health`: liveness (no database access).
- `GET /api/ready`: `200` only when the database is reachable and every migration bundled with the build is
  applied; otherwise `503`. Use it for uptime monitoring.
- Logs: server code logs only error names, never request bodies, keys or connection strings. AI calls are recorded in
  the `ai_usage` table (tokens, estimated cost, latency, status); check spend with
  `select date_trunc('day', created_at), sum(cost_usd) from ai_usage group by 1 order by 1 desc;`.
- Security headers: every page gets a nonce-based Content-Security-Policy (`apps/web/src/proxy.ts`) plus the static
  headers in `next.config.ts`. Vercel adds HSTS on its domains.

## 6. AI budget guidance

A generated operation costs about $0.003 with `gemini-3.8-flash` (one call; a repair round doubles it). The default
monthly cap of $5 therefore covers well over a thousand operations. When the cap is reached, new jobs quietly use the
offline generator; nothing breaks. Prices double on 2027-01-01 (see `docs/research/technology-landscape-2026-10.md`).

## 7. Rollback

- Code: Vercel → Deployments → *Instant Rollback* to the previous deployment.
- Database: migrations are **forward-only and additive**. A rollback of code keeps the newer schema, which the older
  code tolerates because columns and tables are only ever added. Never edit a migration that has run in production;
  add a new one. Neon point-in-time restore is the last resort for data problems.

## 8. Production smoke test (after each deployment)

1. `curl https://<domain>/api/health` → `{"status":"ok",…}`; `curl https://<domain>/api/ready` → `ready`.
2. Open the site signed out: `/dashboard` redirects to `/sign-in`, which shows only "Sign in with Google".
3. Sign in with Google; Field HQ shows the campaign with "Start here" on Boot Camp.
4. Play the first two tutorial steps; press F5 (Quicksave), reload Field HQ and use Continue.
5. Request a generated operation; it reaches the briefing (AI-drafted, or "offline generator" without a key).
6. Browser devtools: no Content-Security-Policy violations in the console.
7. Account page: the delete button stays disabled until DELETE is typed (do not delete a real account).
