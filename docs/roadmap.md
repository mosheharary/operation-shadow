# Roadmap

Delivered (2026-10-15): milestones 1–6 of `docs/architecture/implementation-plan.md`, with a six-mission campaign, a
guided tutorial and generated operations. See `docs/IMPLEMENTATION_CHECKLIST.md`.

## Next

1. **Deploy to Vercel + Neon** following `docs/operations/production.md`, then run the smoke test.
2. **Measure on low-end hardware** (an integrated-GPU laptop) and tune the Performance preset against the 30 FPS budget.
3. **Safari and Firefox** browser tests (Playwright projects).

## Gameplay

- Campaign consequences: let flags change later missions (for example, the radar destroyed in White Silence removes
  air patrols from Frozen Ledger).
- Boats and a drivable truck (D14); climbable watchtowers.
- Persistent specialist state across the campaign (wounds, experience), with a `squad_members` table (D45).
- More templates (a fortress, a forest airfield) using the level kit.

## AI

- Runtime event proposals from the model during a mission, recorded as commands so saves and replays stay
  deterministic (D44).
- Debrief narrative written by the model from verified statistics, with the numbers checked against them.
- Voiced HQ lines for generated operations (TTS at generation time, cached by content hash).

## Presentation

- Authored rigged characters and animation (D13).
- Guard chatter variations and more ambience.
- A benchmark run for the settings screen.
