# Known limitations

Honest list as of 2026-10-15. Each item is either a deliberate scope decision (see `docs/architecture/decision-log.md`)
or something that could not be verified here.

## Not verified

- **Vercel production deployment.** Not performed (needs your Vercel, Neon and Google accounts). The production build,
  strict CSP and browser tests were verified against the local production image (`make prod`, `make e2e-prod`). See
  `docs/operations/production.md`.
- **Google sign-in.** Configured but not exercised end to end (no OAuth client here); the dev test login was used.
- **Low-end hardware.** Performance was measured only on an Apple M5 Pro (120 FPS on the High preset). The Performance
  preset exists for weaker GPUs but has not been measured on one.
- **Browsers other than Chrome** (Safari, Firefox) were not tested.

## Deferred features

- **Runtime AI events** during a mission (plan §8.4). The deterministic dynamic-event deck covers generated operations
  instead (D43, D44).
- **AI-written debrief narrative** (plan §8.5). Debriefs use authored text plus the verified score breakdown.
- **Boats and drivable vehicles** (D14). The Marine swims and dives; boats are props.
- **Climbable watchtowers**; guards use them as posts only.
- **Character models** are procedural low-poly mannequins (D13), not authored rigged models.
- **Campaign flags affecting later missions** are recorded (`completed:<mission>`) but no mission reads them yet.
- **Mobile, touch and gamepad** are out of scope (plan §6).

## Behaviour to be aware of

- Mission results are reported by the browser (D46); a player can falsify their own results.
- Saves belong to one mission, squad, seed and difficulty; loading a save from a different mission opens that mission.
- The offline save copy (IndexedDB) uploads on the next game session, not in the background.
- `ai_usage` rows remain after account deletion (anonymised) so the monthly budget stays accurate.
- The 404 page is static, so it renders without the nonce-protected scripts (it needs none).
- Generated operations' own HQ lines (written by the model) are text-only; template and campaign lines are voiced.
