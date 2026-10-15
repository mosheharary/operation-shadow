# Technology Landscape — verified 2026-10-15

*Phase 0 input for the architecture plan. Package data comes from the npm registry and repository activity from GitHub; everything else comes from the official documentation pages linked below, read on 2026-10-15. Re-verify before locking versions at the start of implementation.*

## 1. Changes that affect the plan

1. **Gemini line-up**
   - The 2.5 models are limited to accounts that already used them.
   - **Imagen was shut down on 2026-08-17.**
   - The new *Interactions API* went GA in June 2026; `generateContent` "remains fully supported".
   - On Gemini 3.6+ models, `temperature`, `top_p` and `top_k` are ignored, and Google says future models will reject them with HTTP 400. Determinism must come from our own seeded generator, not from model sampling.
   - **Prices double** on 2026-12-01 for Gemini 4 Argon, and on 2027-01-01 for 3.8 Flash, 3.6 Flash and 3.8 TTS.
2. **TypeScript:** pin **6.0.3**. TS 7.0.2 is npm `latest`, but `typescript-eslint` (pulled in by `eslint-config-next@16.4.1`) requires TypeScript below 6.1.
3. **Drizzle 1.0** is still a release candidate. Use stable **drizzle-orm 0.45.4 with drizzle-kit 0.31.11**.
4. **Better Auth** was acquired by Vercel on 2026-07-07 and remains MIT-licensed.
   - Use **1.7.3 or later**; 1.7.0–1.7.2 had an `account`-table schema regression.
   - The CLI package is now `auth`.
   - Auth.js / NextAuth now receives security fixes only, and v5 never left beta.
5. **Next.js 16.4**
   - Cache Components are on by default for new projects.
   - `middleware.ts` is deprecated in favour of `proxy.ts`, which runs on Node.
   - `params`, `cookies()` and `headers()` must be awaited.
6. **Node:** Vercel Functions offer Node 24.x (the default) and 22.x. Node 26 becomes LTS on 2026-10-28 but is not available on Vercel, so pin **Node 24** in Docker too.
7. **PostgreSQL:** 18.6 is current, and Neon supports 14–18. The PG 18+ Docker image mounts its volume at **`/var/lib/postgresql`**, not `/var/lib/postgresql/data`.
8. **Stale libraries**
   - **howler** has had no release since 2023-09.
   - **@react-three/rapier** has had no commits since 2025-11 and pins Rapier 0.19.2.
   - **recast-navigation-js** has been idle since 2026-02; its author points to `navcat`.
9. **Peer-dependency traps**
   - `postprocessing@6.39.5` requires three below 0.187, so hold three at 0.186.x.
   - drei 10.7.9 bundles three-mesh-bvh ^0.8.3, while the latest is 0.9.16; installing 0.9 directly produces duplicate copies.

## 2. Candidate locked versions

| Area | Package | Version |
|---|---|---|
| Runtime | Node | 24.x LTS (Docker `node:24-bookworm-slim`; Vercel `engines.node: "24.x"`) |
| Runtime | PostgreSQL | 18.6 locally (`postgres:18.6`); Neon project created on PG 18 |
| App | next / eslint-config-next | 16.4.1 |
| App | react / react-dom | 19.3.1 |
| 3D | three / @types/three | 0.186.1 / 0.186.0 |
| 3D | @react-three/fiber | 9.8.2 (peer: react ≥19 <19.4) |
| 3D | @react-three/drei | 10.7.9 |
| 3D | @react-three/postprocessing / postprocessing | 3.2.0 / 6.39.5 |
| State / schema | zustand / zod | 5.0.15 / 4.6.7 |
| Data | drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 |
| Data | pg / @types/pg | 8.23.1 |
| Data | @vercel/functions | 3.10.1 (`attachDatabasePool`) |
| Auth | better-auth (+ `auth` CLI) | 1.7.9 |
| AI | @google/genai | 2.30.0 |
| Tooling | typescript | 6.0.3 |
| Tooling | vitest / @playwright/test | 5.0.4 / 1.64.1 |

**Compatibility.** R3F 9.8, drei 10.7 and r3f-postprocessing 3.2 all accept React 19.3.1 and Next 16.4.1, and Next 16.4's bundled App Router React is 19.3. Add `three` to `transpilePackages`.

## 3. Database and hosting

### Database connection

- **Single driver path.** Use `pg` over TCP in both environments: in production with Vercel Fluid compute plus `attachDatabasePool(pool)` (Neon's recommended method), and locally against Docker Postgres. The Neon serverless driver would need Neon's proxy to reach a local Postgres, so `pg` is the only path that behaves identically in both.
- **Pooled vs direct URL.** The Neon Vercel integration injects two URLs:
  - `DATABASE_URL` (pooled, PgBouncer transaction mode) for runtime queries;
  - `DATABASE_URL_UNPOOLED` (direct) for migrations and `pg_dump`.
- **Transaction-mode limits.** These are not supported: `SET`/`RESET`, `LISTEN`/`NOTIFY`, session advisory locks, and SQL-level `PREPARE`. Driver-level prepared statements are fine.

### Neon Free plan

- **Compute:** 100 CU-hours per project per month, autoscaling up to 2 CU. It scales to zero after 5 minutes.
- **Storage and data:** 1 GB storage per project, 5 GB egress, 6-hour restore window.
- **Branches:** 10 per project.
- **Over-limit behaviour:** going over the storage limit blocks writes; going over compute or egress suspends the database.

### Vercel

| Item | Hobby | Pro |
|---|---|---|
| Function max duration (Fluid compute) | 300 s | 800 s (1800 s in beta) |
| Memory / CPU | 2 GB / 1 vCPU | up to 4 GB / 2 vCPU |
| Request/response body | 4.5 MB | 4.5 MB |
| Cron | once per day, ±59 min | per-minute |
| Commercial use | **not allowed** | allowed |

- **Vercel Workflow SDK** (`workflow` 5.2.2, `'use workflow'` / `'use step'`) has been **GA since 2026-04-16**. Hobby includes 50k events per month; each step is bound by function limits.
- **Vercel Queues** is in public beta.
- **Vercel Blob** is GA. Hobby includes 1 GB storage and 10 GB transfer; going over the Hobby allowance blocks access for 30 days.
- **Next.js `after()`** is stable and runs within the route's `maxDuration`.

## 4. Authentication

**Recommendation: self-host Better Auth 1.7.x** on the Drizzle adapter (`provider: "pg"`).
- It supports email/password and Google sign-in.
- Sessions are stored in the database: 7-day expiry with sliding refresh, plus an optional signed cookie cache.
- Built-in rate limiting is **in-memory by default, which is unsuitable for serverless**. Use `storage: "database"`.

**Next.js wiring:**
- Mount the handler with `toNextJsHandler(auth)` at `app/api/auth/[...all]/route.ts`.
- Read the session server-side with `auth.api.getSession({ headers: await headers() })`.
- Add the `nextCookies()` plugin last in the plugin list.

**Neon Auth** is now "Managed Better Auth", but it only exists on Neon. Using it would break the "same code against local Postgres" requirement, so self-hosted Better Auth is preferred.

## 5. Google Gemini API

| Purpose | Model ID | Status | Price |
|---|---|---|---|
| Default text / structured | `gemini-3.8-flash` | Stable | $0.75 / $3.75 per 1M tokens in/out; doubles 2027-01-01 |
| Budget text | `gemini-3.5-flash-lite` | Stable | $0.30 / $2.50 |
| Cheapest text | `gemini-3.1-flash-lite` | Stable; earliest shutdown 2027-05-07 | $0.25 / $1.50 |
| Premium text | `gemini-4-argon` | Stable (GA 2026-10-13), paid only | $2 / $10, then $4 / $20 from 2026-12-01 |
| Images | `gemini-nano-banana-2.1` | GA 2026-10-06; no free tier; SynthID watermark | $0.0336 per 1K image, $0.0504 per 2K; batch half price |
| Speech (TTS) | `gemini-3.8-flash-tts` / `-lite-tts` | Stable; free tier available | $0.50 text in; $9 / $6 per 1M audio-out tokens, doubling 2027-01-01 |
| Music | `lyria-3.5` | GA; no free tier; SynthID watermark | $0.08 per song |

**TTS output:** WAV, 24 kHz mono 16-bit, 30 prebuilt voices, up to 2 speakers per request.

### Structured output

- **How:** use `responseMimeType: "application/json"` together with `responseJsonSchema`.
- **Supported keywords:** `$defs`, `$ref`, `type`, `enum`, `items`, `prefixItems`, `minItems`, `maxItems`, `minimum`, `maximum`, `anyOf`, `properties`, `additionalProperties`, `required` and `propertyOrdering`.
- **Unsupported keywords:** `pattern`, `minLength`/`maxLength`, `allOf` and `const`. Strip these from the Zod-generated schema and re-validate the parsed output with Zod on the server.
- **Size:** very large or deeply nested schemas may be rejected.

### API choice

- **Interactions API:** stores requests by default (`store=true`, 55 days on paid tiers). Use `store=false` or `generateContent` for stateless generation.
- **Free tier:** content may be used to improve Google's products.
- **Tier 1:** requires a linked billing account and has a $250 spending cap.

### SDK and model IDs

- **SDK:** `@google/genai` 2.30.0. It reads `GOOGLE_API_KEY || GEMINI_API_KEY`, and `GOOGLE_API_KEY` wins if both are set. Keep the key server-only.
- **Model IDs:** pin explicit stable IDs rather than `-latest` aliases, which are hot-swapped on each release. Deprecated IDs may now silently route to replacement models.

## 6. Local development environment (observed on the developer machine)

- **Machine:** Apple M5 Pro, 48 GB RAM, 3024×1964 Retina display.
- **Docker:** Docker Desktop 29.8.2 with Compose v5.5.1. The Docker VM has 15 CPUs and about 16 GB of memory.
- **Installed:** git 2.54 and gh 2.102.
- **Not installed:** Node, npm, pnpm, yarn, bun, the Vercel CLI and psql.
- **Consequence:** the build, test and migration toolchain should run inside containers (`node:24-bookworm-slim`), unless Node 24 is installed locally.

## 7. Sources

- **Next.js:** https://nextjs.org/blog/next-16 · https://nextjs.org/blog/next-16-4 · https://nextjs.org/docs/app/api-reference/functions/after
- **React Three Fiber:** https://r3f.docs.pmnd.rs/getting-started/installation
- **Drizzle:** https://orm.drizzle.team/docs/migrations · https://orm.drizzle.team/docs/upgrade-v1
- **Neon:** https://neon.com/docs/guides/vercel-connection-methods · https://neon.com/docs/connect/connection-pooling · https://neon.com/pricing · https://neon.com/docs/auth/overview
- **Vercel:** https://vercel.com/docs/functions/limitations · https://vercel.com/docs/plans/hobby · https://vercel.com/docs/workflows · https://vercel.com/docs/queues · https://vercel.com/docs/vercel-blob/usage-and-pricing
- **Better Auth:** https://www.better-auth.com/docs/integrations/next · https://www.better-auth.com/docs/concepts/rate-limit · https://better-auth.com/blog/1-7-account-schema · https://better-auth.com/blog/authjs-joins-better-auth
- **Gemini:**
  - Models and pricing: https://ai.google.dev/gemini-api/docs/models · https://ai.google.dev/gemini-api/docs/pricing · https://ai.google.dev/gemini-api/docs/deprecations
  - Structured output and Interactions: https://ai.google.dev/gemini-api/docs/structured-output · https://ai.google.dev/gemini-api/docs/interactions
  - Speech and music: https://ai.google.dev/gemini-api/docs/speech-generation · https://ai.google.dev/gemini-api/docs/music-generation
  - Keys and limits: https://ai.google.dev/gemini-api/docs/api-key · https://ai.google.dev/gemini-api/docs/rate-limits
- **PostgreSQL / Node:** https://github.com/docker-library/docs/blob/master/postgres/README.md · https://github.com/nodejs/Release/blob/main/schedule.json

**Not verified:**
- Per-model free-tier Gemini rate limits; these are shown only in AI Studio.
- The current targets of the `-latest` aliases.
- The exact output-token cap of Gemini 4 Argon.
- Whether Neon's Managed Better Auth is GA or beta.
- Any Drizzle 1.0 GA date.
