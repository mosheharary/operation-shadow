# Operation Shadow — Reference Research Report

*Phase 0 deliverable · prepared 2026-10-15 · pre-implementation; informs the design and the ten Phase 0 questions.*

**Reference title:** *Commandos: Behind Enemy Lines* (Pyro Studios / Eidos Interactive, PC, 1998).

It is used only as a reference for broad gameplay and interaction principles. Operation Shadow is an original work. It will not reuse the reference's maps, characters, portraits, dialogue, music, sound, logos, mission scripts or any other protected material. Original character names are deliberately left out of this report, and roles are described by function.

Source keys are defined in §9. "Inference" marks reasoning rather than documented fact.

---

## 0. Method and limitations

**Accessed:**
- English, Spanish and German Wikipedia.
- A scan of the original manual on archive.org (the OCR is garbled in places).
- The Prima Official Strategy Guide, including a producer interview (archive.org OCR).
- Contemporary reviews in *Computer Gaming World* #173, *PC Zone* #66 and *Next Generation* #49 (archive.org).
- A review aggregator (DeVuego) for excerpts from other outlets.
- Two developer interviews (Arcade Attack).
- A Spanish history article (Vidaextra).
- A fan-made hotkey list (Steam forum) and the Steam store page.

**Not accessible:**
- GameSpot returned HTTP 403; its review was seen only second-hand.
- IGN, GameFAQs, MobyGames and PCGamingWiki.
- The Commandos fan wiki (HTTP 402).
- All Wayback Machine copies, so several reviews cited by Wikipedia could not be read.
- Eurogamer and Rock Paper Shotgun.

**Other notes:**
- **Reference videos:** §5 records exactly what could and could not be inspected.
- **No numbers to copy:** sight distances, hearing radii and barracks sizes are not published in any accessible source. Operation Shadow defines its own values.

---

## 1. Mechanics inventory

### 1.1 Squad and specialists

| Mechanic | Reference behaviour | Src |
|---|---|---|
| Roster | Six specialists. Each mission supplies a fixed subset. Some missions add a temporary "guest" unit, e.g. a rescued pilot who is the only one able to fly the escape plane. | M, P, W-ES |
| Exclusive capabilities | Each specialist holds abilities nobody else has. **Close-combat infiltrator:** silent knife, wall/pole climbing, remote noise decoy, carries bodies and explosive barrels, digs into snow/sand to hide. **Marine:** swim/dive, inflatable boat seating three, silent short-range harpoon. **Driver:** only one who drives vehicles, mans fixed guns, noisy SMG, main medic. **Sapper:** time bomb (~10 s), remote bomb, grenades, bear trap, wire cutters (not usable on reinforced/electric fences). **Sniper:** silent long-range rifle with very few rounds; red scope cursor when blocked or out of range; most fragile unit. **Spy:** enemy officer uniform found in the level, lethal syringe, can engage one soldier in conversation to fix his gaze, carries bodies. | M, P, W |
| Common kit | Everyone carries a noisy pistol with unlimited ammo. All die after a few hits. | M, P, W, W-DE |
| Fragility | Commandos never return fire on their own. Any commando death fails the mission; permanent death was a deliberate design choice. | M, W, R-CGW, R-NG, P-INT |
| Selection | Click the unit or portrait, use number keys, or a deselect key. Right-drag a rectangle or Ctrl+click portraits for groups. A group exposes only shared actions (move, fire pistols). No multi-select under fire. | M, P |
| Expansion direction (1999) | Added knock-outs, handcuffs, thrown lures (stones, cigarettes), prisoners held at gunpoint, and on-the-spot uniform theft. This was the developer's own move toward non-lethal tools. | W |

### 1.2 Movement and traversal

| Mechanic | Reference behaviour | Src |
|---|---|---|
| Stances | Walk (click), run (double-click; not while carrying heavy loads), crawl (C), stand (S). | M, P |
| Footprints | Walking in snow or sand leaves prints that guards follow. Crawling leaves none. | M, P |
| Buildings | Units can hide inside buildings but cannot shoot out. Bodies cannot be hidden inside. | M |
| Water | Only the marine swims or dives. Everyone else needs his boat. | P |
| Vehicles | Limited seats. Vehicles drive in straight lines with no pathfinding. Fast vehicles run enemies over. Armour stops small arms but does not conceal occupants. | M, P |
| Pathfinding fallback | A unit stuck for more than ~5 s moves randomly, then retries ("panic mode"). | I-JB |

### 1.3 Perception and stealth

| Mechanic | Reference behaviour | Src |
|---|---|---|
| Vision cones | Every enemy, enemy vehicle and bunker has a sweeping two-zone cone. **Near zone** (lighter green): seen in any posture. **Far zone** (darker green): seen only when standing; crawling is safe. | M, P, W |
| Occlusion | Solid objects block sight. Large vehicles block sight too, even though the drawn cone appears to pass through them (a presentation mismatch). | M |
| Cone tool | The eye icon or Shift+click shows one enemy's cone at a time. All cones work whether shown or not. A spotting enemy's cone appears automatically. A ground-marker "sight test" existed (OCR unclear). | M, W |
| Concealment states | A buried infiltrator, submerged marine or disguised spy is invisible unless seen entering that state. The spy is exposed by killing or by carrying bodies. | M |
| Noise | Detection depends on loudness and distance. A knife kill goes unnoticed even near a guard facing away. A pistol alerts guards within some distance. SMG fire and grenades are loud. Big explosions probably alert the whole map. Ranges are never published or previewed. | M, P |
| Stimuli investigated | Noises, footprints, bodies, gunshots. | M, P, W |
| Guard roles | Sentries either turn toward a disturbance or leave their post, depending on what they guard. Patrols leave their routes to track intruders. Guards are placed to cover each other. | M, P |
| Discovery response | The spotting guard shouts a warning to nearby guards; strictly by-the-book guards raise the alarm at once. Passive guards order a halt: a commando who stops may be marched to a holding pen (where teammates can free him) or held until reinforcements arrive. Aggressive guards (e.g. ones who saw a kill) shoot, as does anyone if the commando runs or shoots. An option sets whether moving commandos obey the halt order. | M, W |
| Alarm | An alarm shout empties the flagged barracks and makes every enemy more active and quicker to shoot. Barracks can be destroyed. Severity is mission-specific, from "ruins the mission" to deploying tanks. Guards who lose interest in a decoy often raise the alarm instead of returning to post. | M, P, W |
| Bodies | A visible body triggers investigation or an alarm. Only two specialists can carry bodies. Dropping a barrel on a body hides it. | M, P |

### 1.4 Mission structure and rules

| Mechanic | Reference behaviour | Src |
|---|---|---|
| Campaign | 20 missions in four campaigns of rising difficulty: Norway, North Africa, France/D-Day, and the final push into Germany. CGW and some marketing copy say 24. | M, P, W-ES (CGW conflicts) |
| Win / lose | Complete all objectives and bring every commando to the extraction point (truck, boat, autogyro, transport plane, half-track, staff car). Any death fails the mission. Some objectives must be done without raising the alarm. No general time limit. | M, P, W |
| Solutions | Several solutions per mission, usually including one "elegant" one. | R-PCZ, P, R-GS* |
| Scoring | Points come mainly from completion time, then wounds taken. Kills score nothing but are reported. Points accumulate into a rank. | M, P |
| Persistence | Save anywhere in named slots, plus quick-save and quick-load. Restart mission. A 5-character password per mission. | M, GR |
| Difficulty | No difficulty setting. The only preferences are halt-order obedience, voice verbosity and warning flashes. | M |
| Onboarding | Seven short video lessons, plus six single-character training missions with unlimited health. | M |
| Multiplayer | Co-op for up to 6 players over LAN, TCP/IP or Mplayer. | M, P |

---

## 2. UI/UX inventory

| Element | Reference behaviour | Src |
|---|---|---|
| Camera | Fixed isometric view; rotation was planned but cut after playtesting. Arrow-key and edge scrolling. Keypad zoom in, out and reset. Higher resolutions show more of the map. | M, P-INT |
| Multi-view | F2 gives a single view; F3–F7 split the screen into layouts of up to six views. A red frame marks the active view. Alt+click locks a view to a unit (camera icon). More views cost performance. | M, S |
| Portraits | Along the top edge, each with a red health bar. A skull replaces the portrait on death. | M, P |
| Inventory | "Backpack" panel of clickable item icons, which also shows sniper ammo. Tab flips it to the other side of the screen. | M |
| Action buttons | Eye (cones), tracking camera, crawl, stand. | M |
| Minimap | Notebook-style map: blue for own units, red for enemies and objectives. Click to jump there. A folded corner opens the briefing notes. | M |
| Context cursors | Move, use, hand (pick up/carry), gunsight (red when the shot is impossible), eye, camera; item cursors such as syringe, grenade and climbing axe; a "no" sign for out-of-range or blocked actions. | M, P |
| Hotkeys | One key per action: crawl, stand, pistol, hand, knife, shovel, decoy, bomb, detonate, grenade, wire cutters, rifle, first aid, SMG, syringe, uniform, diving/distract, dinghy. Also 1–7 / 0 selection, P pause, Esc menu, Ctrl+B briefing, Ctrl+S / Ctrl+L quick save / load, and Shift / Alt / Ctrl+click modifiers. No rebinding; GameSpot criticised the expansion for changing hotkeys without allowing customisation. | M, K, W |
| Feedback | Voice acknowledgement on orders (can be switched off). A spotting enemy's cone lights up. The eye cursor blinks over a valid target. Optional warning flash (trigger undocumented). | M |
| Briefing access | Ctrl+B or the notebook corner, at any time. | M |
| Save / load | Named slots, per-player profiles, quick-save. A quick-reload screen appears after failure. | M, R-CGW |
| Pause | P pauses. Whether orders can be issued while paused is undocumented. | M |

---

## 3. Audio and dialogue inventory

| Category | Reference behaviour | Src |
|---|---|---|
| Unit voices | Spoken acknowledgement on orders, on by default ("Verbose"); "Laconic" silences them. Cartoonish, exaggerated pain cries. | M, R-PCZ |
| Living-world audio | The lead programmer credits "sound, voices and other expressive tones" with making the world feel alive. | I-JB |
| Enemy speech | Warning shouts to nearby guards, halt orders, and an "Alarm" cry that brings out barracks reinforcements. Language and accents not verified. | M, P, SG |
| Diegetic cues | Patrol-boat engine noise signals danger. The decoy emits an unpleasant noise. Gunfire and explosions are alert events. | P, M |
| Footsteps | Footprints are a visual mechanic. No documented rule about footstep noise. | M, P |
| Music | Credited to David García-Morales; Spanish Wikipedia also credits César Astudillo. The options menu exposes effects volume only. Whether the music adapts to game state is undocumented. | M, W, W-ES |
| Briefing | An unseen colonel narrates a walkthrough over the map. Missions open with archival newsreel footage. | M, W-ES, R-PCZ, VX |

---

## 4. Reception

**Scores** [W]: GameRankings 81% · GameSpot 8.4 · IGN 8.2 · PC Zone 87% · PC Gamer UK 80% · Next Generation 4/5 · Edge 7/10 · GameRevolution A− · Game Informer 8.75 · CGW 2.5/5.

**Praised** [R-NG, R-PCZ, R-CGW, DV]:
- Originality and graphics.
- The satisfaction when a plan works.
- Open-ended, replayable missions.
- Visible enemy cones and intuitive controls.
- AI that rewards observation.

**Criticised** [R-PCZ, R-CGW, R-NG, DV]:
- Brutal trial-and-error difficulty and constant quick-saving.
- Early mistakes, such as losing the getaway vehicle or running out of explosives, can silently make a mission unwinnable.
- Correct plans can need several attempts to get the timing right.
- Fiddly controls, and a fixed camera that hides action.
- Total micromanagement: units don't defend themselves and group orders are limited.
- Long waits, slow reloads, crashes and a save bug.

**Developers in hindsight** [I-PD, I-JB]:
- They would add more tutorials and a softer learning curve.
- They call the game "devilishly hard but always understandable in retrospect".
- The sequel set out to give players "the chance to recover".

**Commercial** [W, W-DE]:
- The team expected about 15k sales. The game reached #1 in Germany and the UK for months.
- It sold 706k by the end of 1998 and 1.5M+ by May 2000 (other figures conflict).
- The German release removed blood and Nazi symbols. The uncut version was banned from open sale there from 1999 to 2024.

---

## 5. Reference-video observations

**Method and honesty note.**
- **No live playback.** The Chrome window was reported as hidden, so YouTube never loaded the video.
- **What was used instead:**
  - genuine frames from YouTube's storyboard sprite sheets (the scrub-bar previews): every 5 s for V1, with all 78 frames viewed, and every 10 s for samples of V2 and V3;
  - YouTube's 1280×720 auto-thumbnails, with estimated timestamps;
  - the auto-generated transcripts.
- **No audio was heard.** Voice and music notes come from captions only and may contain recognition errors.
- **Small on-screen text** was unreadable at storyboard resolution.

| Key | Video | What was inspected |
|---|---|---|
| V1 | "Commandos Behind Enemy Lines - Gameplay (PC/HD)", SergiuHellDragoonHQ, 6:22 | All storyboard frames (5 s), 3 HD thumbnails, transcript |
| V2 | "Commandos Behind Enemy Lines (1998) \| PC \| Full Playthrough - Part 2", Tykirou, 7:34:13 | 15 four-minute storyboard samples, 3 HD thumbnails; transcript garbled and unusable |
| V3 | "Commandos: Behind Enemy Lines (1998) Stream #4", TheSpiderCookie, 5:33:03 | 13 four-minute samples plus 5 higher-resolution sheets, 1 gameplay HD thumbnail, transcript (streamer speech mixed with game voices) |

**Observations.** "Seen" means directly seen in frames; "Captions" means taken from the transcript; "Inference" means reasoning.

| Topic | Observation | Src |
|---|---|---|
| Camera | **Seen:** one fixed high-oblique view of painted 2D maps; no rotation; the view pans across the map. **Inference:** a zoom exists (the same base appears at about 2× sprite scale with an unchanged HUD). **Seen:** a small inset window at the top right, possibly a secondary view or a map. | V1, V2 |
| HUD placement | **Seen:** the HUD sits only on the screen edges, leaving the battlefield unobstructed. **Top strip (full width):** portraits on the left (vertical red health bars, skull on death), a stance icon, and tool icons on the right (help, camera, enemy-view eye). **Right edge:** a narrow notebook strip. **Bottom-right corner:** the selected unit's gear and backpack art with a hand icon. No message log and no clear minimap. | V1–V3 |
| Selection | **Seen:** only the selected commando's portrait is in colour, and the bottom-right gear art changes with the selection. A small green marker appears at the unit's feet. | V1, V3 |
| Vision cones | **Seen:** flat, translucent green wedges on the ground, two-tone (brighter near, darker far) and notched by obstacles such as a rock outcrop. Trees, tents and towers are drawn over them. Usually one cone is visible at a time, changing direction between frames as guards turn. | V1–V3 |
| Enemies | **Seen:** static sentries at booths and towers; patrol groups of 3–6 walking in formation; bodies and blood decals that persist; footprint trails in snow. **Captions:** the streamer describes guards turning to investigate, footprints fading over time, decoys and bear traps used as lures, and being unable to carry a body down a ladder. | V2, V3 |
| Mission flow | **Seen, in order:** a briefing slideshow (archival photo, or a map with a red route line, on the left; red title and text on the right) → a guided pan over key locations in the level → the objectives notebook → play. **Seen, at the end:** a results screen with stats and Next Mission / Play Again, or a GAME OVER screen with Continue / Play Again / Quick Load over a sepia-tinted frozen map. **Seen:** sepia main menu with New, Save, Load, Options, Credits, Help and Quit. **Captions:** V1's narrated briefing gives the target, how the team is split up, a rendezvous-and-boat plan, and a hint to use fuel barrels. | V1–V3 |
| Retry behaviour | **Seen:** several GAME OVER screens, each followed by the same area again; save/load screens in most of V3's 4-minute samples. **Captions:** the streamer says they save constantly. | V2, V3 |
| Animation and effects | **Seen (stills only):** a fireball replacing a destroyed structure; boats and trains moving across frames; scorch marks; bodies and blood that persist. Motion quality could not be judged. | V1, V2 |
| Voice and music | **Captions:** the briefing is narrated to the player as "officer"; [Music] tags appear at the end of the briefing and on the results screen; units answer orders with very frequent short acknowledgements whose tone varies by character (formal vs casual). In V3 these barks number in the hundreds over the stream, and a viewer's chat joke about filtering out a repeated bark shows the repetition is noticed. No sound-effect information. | V1, V3 |

**Design implications** (these feed §8):
1. **Instant retries.** Players retry constantly, so reloads must be instant, with clear checkpoint and recovery options (T13, T14, T28).
2. **Varied barks.** Voice barks need variety pools, cooldowns and a verbosity setting (T22).
3. **Guided briefing tour.** Present the briefing as a camera tour over the real 3D mission space (T21, T29).
4. **Honest cones.** Draw cones as terrain-projected visibility polygons computed from the same occlusion data the AI uses (T1, T2).
5. **Edge-anchored HUD.** Keep the HUD at the screen edges so the battlefield stays clean (T31; prompt §7).
6. **Fading footprints and carry rules.** Footprints fade over time (T5). Traversal checks what a unit is carrying, e.g. no ladders while carrying a body (T30).

---

## 6. Core design principles to preserve

1. **Perception the player can read and query.** Two-zone, stance-sensitive vision, with cones shown on demand. [M, P, W, DV]
2. **The squad is the puzzle.** Each specialist holds exclusive keys ("the right man in the right place"). [M]
3. **Stealth because combat is lethal.** Operatives are fragile; scoring rewards speed, health and elegance, not kills. [M, P, W-DE]
4. **Readable, staged escalation.** Warning → halt/capture → alarm → reinforcements, with intermediate states you can recover from. [M]
5. **Systemic lures.** Noise, footprints, bodies and disguise move guards in predictable, exploitable ways. [M, P]
6. **Hand-built-feeling dioramas** with several valid solutions. [VX, W, R-PCZ]
7. **Watching several places at once** through multi-view and tracking. [M, S]
8. **Strong framing.** A narrated map briefing, an archival-style intro, and objectives one key away. [M, W-ES, R-PCZ]

## 7. Opportunities for modern improvement

1. **Coordination tools** such as queued and synchronised orders, because failures often came from execution timing. [R-CGW, R-PCZ]
2. **Onboarding and difficulty presets** for detection speed, alarm forgiveness and checkpoint frequency. [I-PD, §4]
3. **Recovery instead of restart:** checkpoints, survivable capture, fewer mission-ending alarms, and an explicit warning when a mission becomes unwinnable. [R-PCZ, R-CGW, I-JB]
4. **Honest, richer overlays:**
   - several cones at once;
   - cones drawn from the same occlusion the AI uses;
   - noise-radius previews;
   - alert levels shown by shape and icon as well as colour.

   [M, P]
5. **Rotatable 3D camera** with occlusion handling (roof and wall cutaways). [R-PCZ, P-INT]
6. **Better controls:** rebindable keys, optional stance and return-fire behaviours, richer group orders. [W, R-NG, R-CGW]
7. **Fast reloads,** and scoring that doesn't push players into save/plan/reload exploits. [DV, P]
8. **Reasons to replay:** per-mission challenges, ratings and generated variants. [DV]
9. **A continuous suspicion model** (required by the build prompt) instead of near-binary detection, which gives players a reaction window. *Inference, consistent with §4 criticisms.*

---

## 8. Reference traceability matrix

These are design decisions proposed for Operation Shadow. Their final form depends on the Phase 0 answers.

| ID | Proposed design decision | Evidence / source |
|---|---|---|
| T1 | Two-zone, stance-aware vision cones (near: any stance; far: standing only) feeding a continuous suspicion value | §1.3 (M, P, W); prompt §9 |
| T2 | Cones rendered from the same occlusion queries the AI uses, fixing the reference's vehicle mismatch | §1.3 (M) |
| T3 | Several enemy cones shown at once, plus a "show all watched areas" toggle | §7.4 (M: one-at-a-time limit) |
| T4 | Noise events with intensity, distance, wall and material attenuation; player-visible noise preview for own actions | §1.3 (M, P); §7.4; prompt §9 |
| T5 | Footprint trails on snow, sand and mud that guards can follow and that fade over time; crawling leaves faint or no prints | §1.2 (M, P); §5 (V2, V3) |
| T6 | Bodies as stimuli; carrying restricted to certain roles; hiding spots (containers, shadows, water) | §1.3 (M, P) |
| T7 | Disguise with explicit exposure rules, plus a "conversation" distraction that fixes a guard's gaze | §1.1, §1.3 (M) |
| T8 | Staged alarm ladder (routine → local suspicion → investigation → sector alert → full alert) with per-level effects; reinforcement sources as destructible map features | §1.3 (M, P, W); prompt §9 |
| T9 | Capture / halt as a recoverable state (rescuable holding area) rather than instant failure | §1.3 (M) |
| T10 | Exclusive specialist abilities through one shared, validated ability interface | §1.1 (M, P); prompt §8 |
| T11 | Fragile operatives; return fire only when the player's stance rules allow it (optional "defend" toggle) | §1.1 (M, R-NG, R-CGW); §7.6 |
| T12 | Score on time vs par, injuries, alarms, stealth and optional objectives, never kill count | §1.4 (M, P) |
| T13 | Save anywhere, quick-save, autosave checkpoints; fast reload | §1.4 (M); §4 (DV: slow reloads) |
| T14 | Difficulty presets (detection speed, alarm forgiveness, checkpoint frequency) | §1.4 (M); §4; I-PD |
| T15 | Rotatable isometric camera with zoom, edge scroll, tracking, and wall/roof cutaways | §2 (M, P-INT); R-PCZ |
| T16 | Picture-in-picture watch windows locked to units or points | §2 (M, S) |
| T17 | Portrait bar with health and status; context cursors that show impossible actions; one-key-per-ability hotbar | §2 (M, P, K) |
| T18 | Fully rebindable keys | §2 (W: GameSpot criticism) |
| T19 | Order queues, synchronised actions and pause-and-plan (if Option C or the hybrid is chosen) | §7.1 (R-CGW, R-PCZ) |
| T20 | Mission validator that rejects unwinnable layouts; runtime detection of unwinnable states (lost key item or vehicle) with explicit failure or recovery | §4 (R-PCZ) |
| T21 | Briefing narrated over the tactical map; briefing reopenable during the mission | §2, §3 (M, W-ES, R-PCZ) |
| T22 | Voice acknowledgements with a verbosity setting, variety pools and anti-repetition cooldowns; guard warning and alarm callouts as distinct cues | §3 (M, P); §5 (V1, V3: bark repetition) |
| T23 | Diegetic threat cues (vehicle engines, patrol chatter) | §3 (P) |
| T24 | Short interactive tutorial missions, one mechanic at a time | §1.4 (M); I-PD |
| T25 | Several valid solutions per mission; generated missions validated for at least one solution and ideally several routes | §1.4 (R-PCZ, P) |
| T26 | Fictional factions and insignia, no real-world extremist symbols | §4 (W-DE: German release history) |
| T27 | Vehicles that use the same navigation data as units (no straight-line driving) | §1.2 (M, P: reference limitation) |
| T28 | Failure screen offering instant retry from checkpoint, load and restart; results screen offering next mission and replay | §5 (V1, V2); §4 |
| T29 | Briefing as a guided camera fly-over of the actual 3D level with key-location callouts, then an objectives dossier that can be reopened during the mission | §5 (V1, V2); §2 (M) |
| T30 | Traversal rules that depend on carry state and stance (e.g. no ladders while carrying a body; slower when burdened) | §5 (V3 captions); §1.2 (M, P) |
| T31 | Edge-anchored HUD: portrait strip, selected-unit equipment panel, no permanent labels on the battlefield | §5 (V1–V3); §2 (M); prompt §7 |

---

## 9. Source register

| Key | Source |
|---|---|
| W | https://en.wikipedia.org/wiki/Commandos:_Behind_Enemy_Lines |
| W-ES | https://es.wikipedia.org/wiki/Commandos:_Behind_Enemy_Lines |
| W-DE | https://de.wikipedia.org/wiki/Commandos:_Hinter_feindlichen_Linien |
| M | Original manual, scan and OCR: https://archive.org/details/commandos-behind-enemy-lines-manual_202408 |
| P / P-INT | Prima Official Strategy Guide, including the producer interview: https://archive.org/details/CommandosBehindEnemyLines_1998 |
| K | Fan hotkey list: https://steamcommunity.com/app/6800/discussions/0/627457521164694485 |
| S | https://store.steampowered.com/app/6800/Commandos_Behind_Enemy_Lines/ |
| R-CGW | *Computer Gaming World* #173, Dec 1998: https://archive.org/details/Computer_Gaming_World_Issue_173 |
| R-PCZ | *PC Zone* #66, Aug 1998: https://archive.org/details/PC_Zone_66_August_1998 |
| R-NG | *Next Generation* #49: https://archive.org/details/NEXT_Generation_49 |
| DV | https://devuego.es/bd/en/reviews/commandos-behind-enemy-lines |
| I-PD | https://www.arcadeattack.co.uk/ignacio-perez-dolset/ |
| I-JB | https://www.arcadeattack.co.uk/jon-beltran-de-heredia/ |
| VX | https://www.vidaextra.com/cultura/commandos-historia-leyenda-made-in-spain |
| GR | https://www.gamerevolution.com/?p=29235 |
| SG | https://stopgame.ru/game/commandos_behind_enemy_lines/review/10583 (user review, anecdotal) |
| R-GS* | https://www.gamespot.com/reviews/commandos-behind-enemy-lines-review/1900-2538454/ (HTTP 403; seen second-hand only) |
| V1 | https://www.youtube.com/watch?v=JGXux9mLnNw (storyboard frames, HD thumbnails, auto-captions; no live playback) |
| V2 | https://www.youtube.com/watch?v=77ysSwTa8-M (storyboard frames, HD thumbnails; captions unusable) |
| V3 | https://www.youtube.com/watch?v=a3vwgTLh0z4 (storyboard frames, HD thumbnail, auto-captions) |

**Unverified or conflicting points:**
- Mission count: 20 vs 24.
- Starting rank and the intermediate ranks.
- Audio credits.
- Voice language and accents.
- Whether an alarm always fails a mission (sources disagree).
- Guard dogs (one review only).
- Medkit capacity.
- Barracks size.
- Behaviour during pause.
- What triggers the warning flash.
