# HTTP API

All endpoints live under `apps/web/src/app/api`. They are Next.js route handlers, rendered dynamically
(`dynamic = 'force-dynamic'`), and every JSON response carries `cache-control: no-store`.

| Group | Paths | Purpose |
|---|---|---|
| Operations | `/api/health`, `/api/ready` | Liveness and readiness probes |
| Auth | `/api/auth/*` | Better Auth (sessions, Google OAuth, dev login) |
| Game data | `/api/v1/*` | Generated operations, saves, mission runs, campaigns, preferences, account deletion |

Request and response contracts are Zod schemas in `packages/schemas/src`:

- `api.ts`: error envelope, health and readiness responses.
- `mission.ts`: `generationRequestSchema`, `generationJobSchema`, mission spec and briefing.
- `progress.ts`: saves, mission runs, campaigns, preferences, account deletion.

## Conventions for `/api/v1/*`

The shared helpers are in `apps/web/src/server/api.ts`.

### Authentication

Every `/api/v1` handler calls `requireApiSession()`. It reads the Better Auth session from the request cookies
(database-backed lookup in `apps/web/src/server/session.ts`). Without a valid session the response is
`401 unauthorized` ("Sign in first"). There are no API keys or bearer tokens.

### Same-origin check (CSRF)

Every state-changing handler (`POST`, `PUT`, `PATCH`, `DELETE`) calls `requireSameOrigin(request)` before
anything else. The `Origin` header must be present and equal to either the origin of `BETTER_AUTH_URL` or the
origin of the request URL. Otherwise the response is `403 forbidden` ("Cross-site request refused"). Browsers always
send `Origin` on these methods. The session cookie is `SameSite=Lax`, which is the second layer.

`GET` handlers do not check `Origin`.

Note the order: the origin check runs before the session check, so a cross-site request without a session gets
`403`, not `401`.

### Request bodies

`readJson(request, schema, maxBytes)` reads JSON bodies:

1. If `Content-Length` is larger than `maxBytes`, it returns `413 payload_too_large`.
2. It reads the body text. If the text is longer than `maxBytes`, it returns `413`.
3. An empty body is treated as `{}`. Text that is not JSON gives `400 bad_request` ("Request body must be JSON").
4. The value is validated with the Zod schema. The first issue becomes a `400` message such as
   `theatre: Invalid option`, cut to 200 characters.

The default limit is 16 KiB. Some routes use a different limit (listed per route). Most schemas are strict
objects, so unknown fields are rejected with `400`.

### Route ids and ownership

- `requireUuid(id)` checks that an `[id]` path segment is a UUID. A malformed id returns `404 not_found`, the same
  as a missing one. Ids are lower-cased before use.
- Save slot names are checked against `saveSlotSchema`. An unknown slot returns `404`.
- Every repository call is scoped by the signed-in user's id (see [database.md](database.md#repositories-and-ownership)).
  A row owned by another user is never read or changed; the handler answers `404 not_found`, exactly as for an id
  that does not exist. The API never reveals whether another user's id exists.

### Error envelope

`handle(run)` wraps every `/api/v1` handler. An `ApiProblem(code, message)` thrown inside becomes:

```json
{ "error": { "code": "not_found", "message": "Not found" } }
```

The shape is `apiErrorSchema` in `packages/schemas/src/api.ts`. Messages are short and safe to show to the player.
Any other exception is logged with its error name only, and the client receives
`500 internal` ("Something went wrong. Please try again.").

| Code | Status | Typical cause |
|---|---|---|
| `bad_request` | 400 | Invalid JSON, schema failure, missing `Idempotency-Key`, unknown mission, bad save data |
| `unauthorized` | 401 | No valid session |
| `forbidden` | 403 | Missing or foreign `Origin` header |
| `not_found` | 404 | Unknown, malformed or not-owned id or slot |
| `conflict` | 409 | Two generation jobs already active; save damaged beyond recovery |
| `payload_too_large` | 413 | Body over the route's limit |
| `rate_limited` | 429 | Daily generation quota reached |
| `internal` | 500 | Unexpected error |
| `service_unavailable` | 503 | Defined in the schema; no route currently returns it |

`/api/health`, `/api/ready` and `/api/auth/*` do not use this envelope.

## Health and readiness

### `GET /api/health`

Liveness. Does not touch the database. No auth.

`200`, body `healthResponseSchema`:

```json
{ "status": "ok", "service": "operation-shadow", "version": "0.1.0", "time": "2026-10-15T09:00:00.000Z" }
```

`version` is `npm_package_version`, falling back to `0.1.0`.

### `GET /api/ready`

Readiness. No auth. Calls `checkReadiness` from `packages/db/src/readiness.ts` (see
[database.md](database.md#readiness-check)).

Body `readinessResponseSchema`:

```json
{ "status": "ready", "checks": { "database": "ok", "migrations": "ok" } }
```

| Status | When |
|---|---|
| `200`, `status: "ready"` | `database: ok` and `migrations: ok` |
| `503`, `status: "not_ready"` | Database unreachable (`error`), or migrations `pending`/`error` |

If the check itself throws (for example the pool cannot be created), both checks are reported as `error`.

## Authentication: `/api/auth/*`

`apps/web/src/app/api/auth/[...all]/route.ts` forwards `GET` and `POST` to Better Auth's Next.js handler
(`toNextJsHandler`). The auth instance is created on the first request. Configuration is in
`apps/web/src/server/auth-options.ts`:

- Google sign-in when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Callback:
  `/api/auth/callback/google`.
- Email and password only when the dev login is enabled (local and test environments). Public sign-up is disabled;
  the seed script creates the test operators. The sign-in page itself uses a server action
  (`apps/web/src/app/sign-in/actions.ts`), not a direct API call.
- Sessions last 7 days and are refreshed once a day.
- Rate limit: 100 requests per 60-second window, counted in the `rate_limit` table.
- Secure cookies when `BETTER_AUTH_URL` starts with `https://`.

The endpoints and their responses are Better Auth's own; this repository does not change them.

## Generated operations

The job pipeline is in `apps/web/src/server/generation.ts`. Job stages (`JOB_STAGES` in `mission.ts`):
`queued`, `drafting`, `validating`, `building`, then one of `ready`, `failed`, `cancelled`.

Every job endpoint returns `{ "job": GenerationJob }` (`generationJobSchema`):

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `stage` | job stage | |
| `message` | string ≤ 200 | Player-facing stage text; for `failed`, the stored player-safe error |
| `missionKey` | string or null | `op-<mission uuid>` once `ready` |
| `source` | `gemini` / `mock` / `fallback` or null | Only filled by `GET /:id` and `POST /:id/advance` once a mission exists |
| `provider` | `gemini` / `mock` / `disabled` | Provider chosen when the job was created |
| `createdAt`, `updatedAt` | ISO date-time | |

### `POST /api/v1/generation-jobs`

Starts generating an operation. Auth: session. Same-origin: yes.

Headers:

- `Idempotency-Key` (required): 8–100 characters from `A–Z a–z 0–9 _ -`. Missing or malformed gives `400`.

Body: `generationRequestSchema`, at most 2048 bytes. All fields are optional.

| Field | Values | Default |
|---|---|---|
| `theatre` | `any`, `coastal`, `alpine`, `rail` | `any` |
| `timeOfDay` | `any`, `dawn`, `day`, `dusk`, `night` | `any` |
| `weather` | `any`, `clear`, `rain`, `fog`, `snow` | `any` |
| `focus` | `any`, `sabotage`, `steal`, `rescue` | `any` |
| `codename` | ≤ 40 chars, starts with a letter, then letters, spaces, `'` and `-` | none |
| `offline` | boolean: skip the model and use the offline generator | `false` |

Checks, in order:

0. Idempotency. If this user already has a job with this `Idempotency-Key`, it is returned with `200` and nothing
   else is checked (a retried request never fails on a quota it already passed).
1. Daily quota. If the user created `AI_DAILY_JOBS_PER_USER` or more jobs in the last 24 hours, the response is
   `429 rate_limited`. The default is 20 (the local Compose stack sets 500).
2. Concurrency. If the user has two or more jobs in an active stage created in the last 10 minutes, the response is
   `409 conflict`.
3. Provider. With `offline: true` the provider is `disabled`. Otherwise `providerForNewJob()` decides:
   - `AI_PROVIDER=mock` gives `mock`, except in production, where it gives `disabled`.
   - `AI_PROVIDER=disabled`, or no `GOOGLE_API_KEY`, gives `disabled`.
   - Otherwise `gemini`, but only while the estimated spend of all users this calendar month (UTC), summed from
     `ai_usage.cost_usd`, is below `AI_MONTHLY_BUDGET_USD` (default 5). Over budget, the job uses `disabled`.

   A `disabled` provider still produces a playable mission: the pipeline uses the offline generator.

The job is created with a random seed. The `(owner, Idempotency-Key)` pair is unique:

| Status | When |
|---|---|
| `202` | New job created. The first pipeline run is scheduled with `after()`, so it starts after the response is sent |
| `200` | A job with this key already exists for this user; it is returned unchanged and nothing new starts |

### `GET /api/v1/generation-jobs/:id`

Returns the job. Auth: session. No body. `200 { job }`, or `404` if the id is malformed, unknown or another
user's.

### `POST /api/v1/generation-jobs/:id/advance`

Drives the job if no worker holds it, then returns its state. Auth: session. Same-origin: yes. The body is ignored.
`maxDuration` is 300 seconds.

`advanceJob` tries to claim the job's lease (150 seconds). The claim succeeds only for a job in an active stage
whose lease is empty or expired:

- Claimed: the request runs the pipeline to the end (model call with retries, validation, one repair, offline
  fallback), records AI usage, and stores the mission and the `ready` stage in one transaction. An unexpected error
  marks the job `failed` with "The operation could not be prepared. Please try again."
- Not claimed (another request holds the lease, or the job is finished): returns the current state immediately.
- A job claimed more than 3 times is marked `failed` instead of running again.

`200 { job }`, or `404`. The loading screen polls `GET /:id` every 1.5 s and calls `advance` whenever the job is
still active, so a job resumes if the first worker stopped.

### `POST /api/v1/generation-jobs/:id/cancel`

Auth: session. Same-origin: yes. The body is ignored.

Moves an active job to `cancelled` and clears its lease. A running pipeline checks this at its next stage change and
stops before the next model call; a cancelled job never stores a mission. If the job is already finished, its
current state is returned unchanged. `200 { job }` (without `source`), or `404`.

### Example flow

1. The client sends `POST /api/v1/generation-jobs` with `Origin` set to the app,
   `Idempotency-Key: <random uuid>` and a body such as `{"theatre":"rail","focus":"rescue","codename":"Iron Wake"}`.
   It receives `202` with `job.stage: "queued"`. If the network fails, it can resend with the same key and receive
   the same job (`200`).
2. While `job.stage` is `queued`, `drafting`, `validating` or `building`, the client polls
   `GET /api/v1/generation-jobs/<id>` and calls `POST /api/v1/generation-jobs/<id>/advance`. `job.message`
   describes each stage.
3. When `job.stage` is `ready`, `job.missionKey` is `op-<uuid>`. The client opens `/missions/<missionKey>`, the
   briefing page. Only the owner can open it; anyone else gets a 404 page.
4. If the stage is `failed`, `job.message` holds a safe message. The player can start a new job, for example with
   `offline: true`.

## Saves

Limits and helpers: `packages/schemas/src/progress.ts` and `apps/web/src/server/saves.ts`.

- Slots (`SAVE_SLOTS`): `quick`, `auto`, `manual-1`, `manual-2`, `manual-3`.
- Upload limit: 1 MiB compressed (`SAVE_MAX_COMPRESSED_BYTES`), 8 MiB after decompression (`SAVE_MAX_JSON_BYTES`).
- Current format version: `SAVE_SCHEMA_VERSION = 1`.

`SaveSummary` (`saveSummarySchema`): `slot`, `missionKey`, `missionTitle`, `seconds` (mission time, tick / 20),
`objectivesDone`, `objectivesTotal` (objectives not hidden), `squad`, `difficulty`, `updatedAt`.

### `GET /api/v1/saves`

The user's save slots, newest first. Auth: session.

`200 { "saves": SaveSummary[] }`.

### `PUT /api/v1/saves/:slot`

Writes a save. Auth: session. Same-origin: yes.

The body is the save JSON compressed with gzip (the client sends `content-type: application/gzip`; the header is not
checked). Processing:

1. Unknown slot gives `404`.
2. `Content-Length` or the received body over 1 MiB gives `413`.
3. The body is decompressed with an 8 MiB output cap. Over the cap gives `413`; data that is not gzip gives `400`.
4. The JSON is parsed (`400` if invalid), passed through the save-format migration chain (`migrateSave`, empty for
   version 1), and validated with `savePayloadSchema` (`400 "Invalid save: …"`). The payload holds `version`,
   `missionKey`, `missionTitle` (≤ 60), `setup` (`seed`, `squad` of 1–6 specialists, `difficulty`), the
   simulation `state` envelope (running state, 1–6 operatives, ≤ 8 objectives), `camera` or null, `selection`
   (≤ 6) and `savedAt`.
5. `missionKey` must be a campaign mission or one of the user's own generated operations; otherwise
   `400 "Unknown mission"`.
6. The server re-serialises the payload, gzips it again (the upload is never stored as sent), computes a SHA-256
   checksum of the JSON, and writes a new revision in one transaction. The newest 3 revisions per slot are kept.

`200 { "save": SaveSummary }`.

### `GET /api/v1/saves/:slot`

Loads a save. Auth: session.

The server tries the slot's current revision first, then older revisions. A revision counts as damaged if gunzip
fails, the checksum does not match, or it fails validation.

| Status | Body |
|---|---|
| `200` | `{ "save": SaveSummary, "payload": SavePayload, "recovered": boolean }`. `recovered` is `true` when an older revision was used |
| `404` | Unknown slot, or no save in it |
| `409 conflict` | Every kept revision is damaged ("This save is damaged and could not be recovered") |

### `DELETE /api/v1/saves/:slot`

Auth: session. Same-origin: yes. Deletes the slot and its revisions and records a `save_deleted` audit event.
`200 { "deleted": "<slot>" }`, or `404`.

## Mission runs

### `POST /api/v1/mission-runs`

Records the start of an attempt. Auth: session. Same-origin: yes.

Body `startRunSchema` (16 KiB limit):

| Field | Rule |
|---|---|
| `missionKey` | `missionKeySchema`: a campaign key (`[a-z][a-z0-9-]{1,40}`) or `op-<uuid>` |
| `squad` | 1–6 specialist ids (`infiltrator`, `recon`, `engineer`, `deception`, `medic`, `marine`) |
| `difficulty` | `standard` or `veteran` |
| `seed` | integer 1 to 2³¹−1 |

The mission must resolve for this user (`400 "Unknown mission"` otherwise). The run is linked to the user's active
campaign (created on first use) when the key is a campaign mission or starts with `op-`.

`201 { "run": { "id": "<uuid>" } }`.

### `POST /api/v1/mission-runs/:id/complete`

Records how an attempt ended. Auth: session. Same-origin: yes.

Body `completeRunSchema` (16 KiB limit):

| Field | Rule |
|---|---|
| `outcome` | `success`, `failure` or `abandoned` |
| `score` | integer 0–100 000, or null |
| `rank` | `S`, `A`, `B`, `C`, `D`, or null |
| `medals` | subset of `ghost`, `restraint`, `untouchable`, `thorough`, `swift` |
| `durationSeconds` | integer 0–86 400 |
| `stats` | map of up to 40 keys (≤ 40 chars) to finite numbers |

A run can be completed once. A run that is already finished, unknown or another user's gives `404`. On success the
run is folded into its campaign: per-specialist service records always; for campaign missions only, best score, best
rank, merged medals, completion count and a `completed:<missionKey>` flag. Progress updates use optimistic
concurrency with up to 5 retries.

`200 { "run": { "id": "<uuid>", "outcome": "success" } }`.

The result is the client's own report. The game is single-player and simulated in the browser, so the server does
not verify it; it only affects the player's own progress.

## Campaigns

Campaign view: `{ id, name, difficulty, progress, updatedAt }`. `progress` is `campaignProgressSchema`
(`completed`, `flags`, `service`); stored progress that fails validation is returned as empty progress.

### `GET /api/v1/campaigns`

Auth: session. Creates the active campaign ("The Northern Reach", `standard`) if the user has none.

`200 { "active": Campaign, "campaigns": Campaign[] }`. The active campaign is the most recently updated one.

### `POST /api/v1/campaigns`

Starts a new campaign. Older campaigns are kept; the newest becomes active. Auth: session. Same-origin: yes.

Body: `{ "difficulty": "standard" | "veteran" }` (strict).

`201 { "campaign": Campaign }`.

### `PATCH /api/v1/campaigns/:id`

Changes difficulty. Auth: session. Same-origin: yes. Body: `{ "difficulty": "standard" | "veteran" }`.

`200 { "campaign": { "id", "difficulty" } }`, or `404`.

### `DELETE /api/v1/campaigns/:id`

Auth: session. Same-origin: yes. Records a `campaign_deleted` audit event. Runs that pointed at the campaign keep
their row with `campaign_id` set to null.

`200 { "deleted": "<id>" }`, or `404`.

## Preferences

Settings that follow the player between browsers. Graphics settings stay per device and are not sent.

### `GET /api/v1/preferences`

Auth: session. `200 { "preferences": { "schemaVersion": 1, "settings": { … } } }`. A user with no stored
preferences gets `{ "schemaVersion": 1, "settings": {} }`.

### `PUT /api/v1/preferences`

Auth: session. Same-origin: yes. Body `preferencesSchema`, request limit 20 KiB:

- `schemaVersion`: must be `1` (`PREFERENCES_VERSION`).
- `settings`: map with keys of at most 40 characters; the JSON of the map must be at most 16 KiB.

A body over 20 KiB gives `413`; settings over 16 KiB inside a smaller body give `400`. The document replaces the
stored one. `200 { "preferences": <body> }`.

## Account

### `POST /api/v1/account/delete`

Permanently deletes the signed-in account. Auth: session. Same-origin: yes.

Body `deleteAccountSchema`: exactly `{ "confirm": "DELETE" }`. Anything else, including lower-case `delete` or an
empty body, gives `400`.

Effects:

1. Deletes the `user` row. Sessions, OAuth accounts, preferences, campaigns, runs, saves, generation jobs and
   generated missions cascade (see [database.md](database.md#account-deletion)).
2. Records an `account_deleted` audit event with no user id and only the first 16 hex characters of a SHA-256 hash
   of the user id.
3. Expires the Better Auth cookies (`better-auth.session_token`, `better-auth.session_data` and their `__Secure-`
   variants).

`200 { "deleted": true }`.
