# Security: threat model and checklist

Scope: a single-player browser game with accounts, server-stored progress and saves, and server-side AI generation.
There is no multiplayer, chat or user-to-user content.

## Assets

- Player accounts and sessions (Google identity, session cookies).
- Player data: campaigns, results, saves, generated operations, settings.
- Server secrets: `GOOGLE_API_KEY`, `BETTER_AUTH_SECRET`, Google OAuth secret, database URLs.
- The AI budget (real money).

## Threats and controls

| Threat | Control | Where | Verified by |
|---|---|---|---|
| IDOR: reading or changing another player's data by id | Every repository function takes the owner id from the session and filters by it; other users' ids return 404 (no existence leak) | `packages/db/src/repositories/*`, `apps/web/src/server/api.ts` (`requireUuid`) | integration tests (`generation`, `progress`), browser tests (jobs, missions, saves with Operator B) |
| Budget abuse | Daily jobs per user, max 2 in flight, global monthly spend cap; cached generated missions are replayed, not regenerated | `apps/web/src/app/api/v1/generation-jobs/route.ts`, `server/generation.ts` | integration test (spend sum); quota observed working in practice |
| Prompt injection | Only enumerated choices reach the prompt, plus an optional codename restricted to letters, spaces, `'` and `-` (≤ 40) | `packages/schemas/src/mission.ts`, `packages/ai/src/plan.ts` | unit and browser tests (`<all>` in a codename → 400) |
| Unsafe or broken AI output | Strict Zod schema with length limits; plain-text check (no markup, links, control characters); blocklist of real extremist names and slurs; catalog checks; level validation; one repair, then the offline generator; all text rendered as React text, never HTML | `packages/ai` | unit tests for every mock failure mode |
| XSS | No `dangerouslySetInnerHTML`; nonce-based CSP with `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'` | `apps/web/src/proxy.ts` | browser tests fail on any console error (CSP violations included), dev and production |
| CSRF | State-changing `/api/v1` requests require an `Origin` matching the app; session cookie is `SameSite=Lax`, `HttpOnly`, `Secure` on https | `requireSameOrigin` | browser tests (cross-site POST and PUT → 403) |
| Secret leakage | Secrets are server-only (no `NEXT_PUBLIC_`); the Gemini key is sent only in a request header and redacted from error messages; logs record error names only | `packages/ai/src/providers.ts`, `server/api.ts` | `make scan-bundle` (client bundle scanned for every secret value and key pattern); unit test for redaction |
| Dev login in production | Startup fails if `ALLOW_DEV_LOGIN=true` in production; disabled on previews | `apps/web/src/server/dev-login.ts` | unit tests |
| Oversized payloads | JSON bodies limited per route (2–20 KB); saves 1 MB compressed and 8 MB uncompressed with bounded gunzip | `readJson`, `server/saves.ts` | browser tests (413, invalid gzip → 400) |
| Corrupt or forged saves | Server re-validates and re-serialises; SHA-256 checksum; three revisions; the engine re-checks mission and level ids on restore | `server/saves.ts`, `World.restore` | integration and browser tests |
| Vulnerable dependencies | Pinned versions, 7-day minimum release age, reviewed install scripts, `make audit` | `pnpm-workspace.yaml` | `pnpm audit --prod`: no known vulnerabilities (2026-10-15) |

## Accepted risks

- **Client-reported results.** The simulation runs in the browser, so a player can falsify their own mission results.
  They only affect that player's progress (no leaderboards).
- **`ai_usage` rows outlive account deletion** (user reference set to NULL) so the monthly budget stays accurate; they
  contain no personal data.
- **`style-src 'unsafe-inline'`** is needed for React style attributes; scripts remain nonce-only.

## Checklist (before each release)

- [ ] `make check` passes (lint, typecheck, unit and integration tests)
- [ ] `make e2e` and `make e2e-prod` pass
- [ ] `make scan-bundle` reports no secrets
- [ ] `make audit` reports no known vulnerabilities (or each is triaged in the decision log)
- [ ] No new `NEXT_PUBLIC_` variable carries a secret; `.env` is not committed
- [ ] New API routes use `handle`, `requireApiSession`, `requireSameOrigin` (for writes), `readJson` and owner-scoped repositories
- [ ] New migrations are additive (forward-only)
