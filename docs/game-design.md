# Game design

**Operation Shadow** is a real-time tactical stealth game with tactical pause, played from a rotatable top-down
camera. The player commands Shadow Section, six specialists of a fictional Coalition, behind the lines of the Dominion,
a fictional occupying power in a WWII-inspired setting. It is inspired by the *Commandos* series but uses no assets,
names, maps or text from it.

## Core loop

1. **Briefing:** read the situation, intelligence and rules of engagement; choose the squad (each mission sets
   required specialists and a squad size).
2. **Infiltrate:** read the sentries (view cones, patrols, light, sound), move through cover, remove or distract guards,
   hide the evidence.
3. **Act:** sabotage, steal or rescue; optional objectives may appear during the mission.
4. **Extract:** every surviving specialist must reach the extraction zone.
5. **Debrief:** score, rank (S–D) and medals from the real statistics of the run.

Non-lethal play is always viable and rewarded; killing is never required and never scores points.

## The squad

| Call sign | Specialist | Signature skills |
|---|---|---|
| MOTH | Infiltrator | Silent takedown from behind, knife, tie up, noise and trigger lures |
| OWL | Recon | Binoculars, tranquilliser darts, rifle |
| BADGER | Combat Engineer | Pick locks, cut wire, sabotage, demolition charges, tie up |
| FOX | Deception | Disguise (take an officer's uniform), talk to guards to hold them, sedative |
| HERON | Field Medic | Revive the downed, chloroform, smoke |
| OTTER | Marine | Swim and dive, harpoon, knife, tie up |
| MAGPIE | Spy | No weapons at all. Walks openly among the enemy until the first sector alert, then his cover is blown for good. Chat: a sentry stops looking around and watches only him for 10 seconds |

Everyone can stand, crouch or go prone, carry bodies, hide them in containers, throw stones, use first aid, fire a
pistol (except MAGPIE, who is unarmed) and resupply a teammate with ammunition they can fire (pistol rounds, rifle rounds, harpoon bolts: all of a type
the giver cannot fire, half of a shared one). Every armed specialist carries 2 spare rifle rounds and 2 spare harpoon
bolts for OWL's suppressed rifle and OTTER's harpoon. Each specialist has a role-specific navigation profile (for example, only OTTER swims).

## Stealth model (engine)

- **Sight:** each guard has a near cone (sees you even crouched) and a far cone (sees you standing or in light).
  Visibility depends on stance, movement, light (lamps, searchlights, time of day), weather and cover such as tall
  grass. Suspicion builds over time instead of instant detection.
- **Sound:** footsteps (by surface, stance and gait), tools, doors, shots and explosions propagate with distance and
  walls against a weather-dependent noise floor. Noise rings show how far a sound carries.
- **Guards:** a deterministic state machine: post or patrol → observe → suspicious → investigate → search →
  alerted/combat, with challenges for disguised operatives, body discovery, wake-up after knockouts, and radio.
- **Alarm ladder:** 0 Routine, 1 Local suspicion, 2 Active investigation, 3 Sector alert (reinforcements), 4 Full
  alert. Some missions fail at full alert, which the briefing always states.
- **All clear:** a raised alarm (Active investigation, Sector or Full alert) clears to Routine 30 s after the last time a
  guard saw or fought the squad. Searches are called off, guards return to their posts, sirens stop and reinforcements
  march back to barracks. The alarm indicator counts down ("All clear in 12s", or "Contact" during a firefight). A body
  found or a new sighting restarts the clock. Dead and missing soldiers stay missing, and MAGPIE's cover stays blown.

The simulation is a fixed 20 Hz deterministic engine (`packages/engine`), so saves, replays and tests are exact.

## Missions

| # | Mission | Map | Conditions | Teaches or tests |
|---|---|---|---|---|
| T | Boot Camp | Training ground | Night, light garrison | The guided tutorial (below) |
| 1 | Silent Tide | Varrow Harbour (coastal) | Night | The vertical slice: radio sabotage, optional codebook |
| 2 | White Silence | Whitecrown Ridge (alpine) | Day, snow (footprints) | Gorge crossing, radar sabotage, optional charts |
| 3 | Iron Junction | Corvan Junction (rail) | Dusk, fog | Ammunition train, timetable, a prisoner revealed mid-mission |

Each starting mission has a hand-built map of its own. Generated operations are played on sites laid out from the job's
seed (coast, mountains, railway, forest or farmland), so no two operations share a map (decision log D77–D78).

Missions are data (`MissionSpec`) compiled onto templates, so the campaign, the tutorial and generated operations share
one validated path: every mission must have a route to its objectives and back that no sentry can see.

## Tutorial

Boot Camp teaches, one instruction at a time with a ground marker: selecting, moving, the camera, group orders, reading
view cones, crouching in grass, a silent takedown, tying up, hiding a body, lock-picking, stealing, getting past a
fence (cut the wire or lure the sentry), regrouping and extracting. Each step advances when the player does it; key
names follow the player's key bindings; the panel can be hidden or skipped. A unit test plays the whole script with the
real right-click logic and requires extraction with zero detections.

## Generated operations

Players can request an operation (theatre, time of day, weather, objective type, optional codename). Google Gemini
drafts it within strict limits, or the offline generator does; see `docs/ai-design.md`. Generated operations add a
dynamic-event deck: patrols spawned out of sight (within a complication budget), weather shifts and intel.

## Planning mode

Space pauses; orders still work while paused. Shift + right-click queues orders; L adds "wait for signal" and Enter
gives the signal so specialists act together. Each specialist can abort the plan if spotted or when the alarm rises. A
timeline shows each specialist's queue with rough durations; 0.5×, 1× and 2× speed let you wait out patrols.

## Scoring

Success scores 1,000 plus: time against par (up to 400), stealth by peak alarm minus detections (up to 300), restraint
(150, minus 30 per kill), squad health (150) and 100 per optional objective. Ranks: S ≥ 1,950, A ≥ 1,700,
B ≥ 1,450, C ≥ 1,200, D below. Medals: Ghost (never detected, alarm ≤ 1), Restraint (no kills), Untouchable (no
injuries or captures), Thorough (all optional objectives), Swift (under par). Time is simulation time, so pausing to
plan is never penalised.

## Progress and saves

The campaign records the best rank and medals per mission and each specialist's service record. Saves: quicksave (F5)
and quickload (F9), autosaves (objective completed; every five minutes while calm), three manual slots, and Continue
from Field HQ.

## Controls (defaults, all remappable)

| Action | Keys |
|---|---|
| Select | Left-click, drag box, 1–6, Ctrl+A |
| Move / context action | Right-click (double right-click runs, Shift queues) |
| Camera | W A S D or arrows, Q/E rotate, wheel zoom, middle-drag, Home resets, T follows |
| Stance | Z stand, C crouch, X prone; F stops |
| Abilities | R G V B Y H N J U K (see the ability bar) |
| View cones | Hover or click a soldier; hold Alt for all |
| Pause, speed | Space; [ and ] |
| Planning | L wait for signal, Enter signal |
| Saves | F5 quicksave, F9 quickload |
| Help, frame rate | F1, F3 |
