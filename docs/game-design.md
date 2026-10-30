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
5. **Debrief:** score, rank (S–D) and medals from the real statistics of the run, beside an after-action chart that
   replays the attempt on the map (see Scoring).

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
  grass. Suspicion builds over time instead of instant detection, and you can watch it build: a sentry who has
  noticed someone casts a sightline, a thread from his eyes that lights up and creeps toward the operative as his
  suspicion grows (pale while he only looks, amber once suspicious, red when he is about to call it; touching the
  operative means spotted) and breaks into a dim dotted line once he loses sight. The screen edge throbs with a
  heartbeat that quickens with the closest call, a watcher out of view gets an eye on the screen edge pointing at
  him, and the portrait chip names the stage and fills with the suspicion. Settings can switch the threads and rim off.
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

**Foresight.** While the game is paused the world greys and cools like a plan on a table, and the next ten seconds
play out as ghosts. The simulation is deterministic, so the client runs it ahead on a copy of the world, with every
order already given (including those given during the pause), and shows exactly what happens if play resumed now:
each patrol and each squad member with an order leaves a dotted track (sentries pale blue, the squad in their own
colours, a larger dot each second), and a ghost walks it on a three-times-speed loop. Trouble is ringed where it
happens as the ghosts reach it: amber when a sentry starts sizing someone up, red with a thread from the sentry at the
sighting. The forecast stops at the first sighting, because from then on it depends on what the player does. A panel
under the control bar gives the verdict ("BADGER spotted in 7.0 s", or "Next 10 s: nobody sees the squad"), the
trouble on the way and a ten-second strip with the ghosts' playhead. Every new order recomputes it; it can be switched
off in the settings. The forecast is pure logic (`runtime/foresight.ts`, with unit tests that check it never touches
the real world and lands where play then really goes).

## Scoring

Success scores 1,000 plus: time against par (up to 400), stealth by peak alarm minus detections (up to 300), restraint
(150, minus 30 per kill), squad health (150) and 100 per optional objective. Ranks: S ≥ 1,950, A ≥ 1,700,
B ≥ 1,450, C ≥ 1,200, D below. Medals: Ghost (never detected, alarm ≤ 1), Restraint (no kills), Untouchable (no
injuries or captures), Thorough (all optional objectives), Swift (under par). Time is simulation time, so pausing to
plan is never penalised.

The debrief's after-action chart replays the attempt in 5 to 12 seconds on a plotting-table map framed on the
action: every squad member's route (a point every half second of mission time when they have moved), stamps for
sightings (one per squad member per six seconds), takedowns, kills, bodies found, casualties, extractions and
completed objectives, hollow diamonds on objectives left undone, and a time strip with the alarm level as a band.
Quiet seconds (nobody moving, nothing happening) play five times faster than busy ones. It can be scrubbed and
replayed, and holds still under reduced motion. The trace covers the whole attempt (from the load, for a continued
save) and is cut back with the field recorder.

## Progress and saves

The campaign records the best rank and medals per mission and each specialist's service record. Saves: quicksave (F5)
and quickload (F9), autosaves (objective completed; every five minutes while calm), three manual slots, and Continue
from Field HQ.

The field recorder keeps the last minute of the current attempt in memory (a full simulation snapshot every two
seconds of mission time; each frame notes the sightings, rising alarms, casualties and objectives that followed it).
Opening it holds the clock and winds the world back to just before the latest run of trouble began; the player scrubs
frame by frame and sees the real past state in the scene. Resuming erases the later frames and plays on in tactical
pause; cancelling restores the present exactly. A failed mission can be wound back from its debrief: the failure stays
on record and the rest of the attempt is reported as a new run. Not available in Boot Camp or after a success. The
debrief shows how many times the tape was wound back.

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
| Saves, field recorder | F5 quicksave, F9 quickload; Backspace winds back |
| Help, frame rate | F1, F3 |
