# MASTER BUILD PROMPT — OPERATION SHADOW: AI-GENERATED 3D TACTICAL STEALTH GAME

## ROLE

Act as a principal game director, senior gameplay engineer, 3D graphics engineer, AI systems architect, UI/UX designer, audio director, security engineer, and DevOps engineer.

You are responsible for designing, implementing, testing, documenting, and delivering a production-quality, browser-based 3D real-time tactical stealth game inspired by the gameplay principles of *Commandos: Behind Enemy Lines* (1998).

The working title is **Operation Shadow**. Treat this as a placeholder that can be changed.

This is not a simple demo, static mockup, or AI-generated story displayed on a webpage. It must become a genuinely playable game with functional 3D environments, controllable specialists, intelligent enemies, meaningful stealth mechanics, tactical decision-making, dynamic missions, persistent accounts, and reliable save/load behavior.

The project must support two first-class deployment targets:

1. Online production deployment using Vercel and Neon PostgreSQL.
2. Local development and testing using Docker Compose, including a local PostgreSQL instance.

Use a server-side Google Gemini API integration to generate mission content and evolving narrative events during gameplay. The game must remain playable when AI generation is slow, rate-limited, or temporarily unavailable.

---

# PHASE 0 — MANDATORY INTERACTION GATE

**Do not implement the game before completing this phase.**

Your first response must contain:

1. A concise summary of your research and understanding of the reference game.
2. Three gameplay directions, described in the Gameplay Direction Selection section below.
3. Exactly ten clear clarifying questions.
4. A statement that you are waiting for the user's answers.

Do not create application files, install dependencies, run scaffolding commands, modify repositories, generate production code, or begin implementation until the user has answered the ten questions and explicitly approved the resulting plan.

You may perform research, inspect supplied references, and prepare architectural recommendations before implementation.

If the user has already answered a question, do not ask it again. Still present ten numbered questions in the initial questionnaire, marking any already answered questions with their known answers and inviting correction.

After receiving the answers:

1. Summarize the decisions.
2. Present the proposed architecture and implementation plan.
3. Identify risks, dependencies, and compromises.
4. Obtain explicit approval of the plan.
5. Only then begin implementation.

Do not interpret silence, an incomplete answer, or the user's choice of gameplay direction as permission to skip this gate.

# 1. RESEARCH AND REFERENCE MATERIAL

Study these references before designing the game:

Primary reference:
https://en.wikipedia.org/wiki/Commandos:_Behind_Enemy_Lines

Gameplay videos supplied by the user:
https://www.youtube.com/watch?v=JGXux9mLnNw
https://www.youtube.com/watch?v=77ysSwTa8-M
https://www.youtube.com/watch?v=a3vwgTLh0z4

Additional references:

* The original game's official manual and controls.
* Contemporary reviews describing the original interface, controls, challenge, character abilities, and sound.
* Documented gameplay mechanics, mission structures, enemy behaviors, and specialist roles.

Research tasks:

A. Gameplay analysis

* Squad control and individual character selection.
* Specialist abilities and inventory.
* Real-time tactical movement.
* Stealth, detection, visibility, and sound propagation.
* Patrol schedules, guard awareness, investigation, and alarm escalation.
* Distractions, environmental interactions, objectives, extraction, and mission failure.
* Multiple possible solutions and the consequences of mistakes.
* Mission briefings, difficulty progression, and mission scoring.

B. UI/UX analysis

* Tactical camera and isometric presentation.
* Character portraits and selection indicators.
* Contextual mouse actions and keyboard shortcuts.
* Equipment inventory and action feedback.
* Enemy sight-cone visualization.
* Tactical map, mission briefing, and objective reminders.
* Save/load workflows and pause behavior.

C. Audio analysis

* Ambient battlefield sound.
* Character acknowledgments and personality.
* Enemy chatter, suspicion, investigation, and alert announcements.
* Footstep and environmental sound cues.
* Adaptive soundtrack states.
* Mission briefing and debriefing dialogue.

D. Reference-video inspection
Inspect the three supplied videos when accessible. Record concrete observations about camera movement, player input, enemy reactions, interface placement, mission flow, animation, sound, and voice lines.

Do not claim to have watched footage that you could not access. Record inaccessible references as limitations and continue using other reliable sources.

Deliver a concise research report before implementation, including:

* A mechanics inventory.
* A UI/UX inventory.
* An audio and dialogue inventory.
* Core design principles to preserve.
* Opportunities for modern improvement.
* A reference traceability matrix linking design decisions to research sources.

## Intellectual property requirements

Create an original spiritual successor, not an unauthorized reproduction.

Do not copy proprietary maps, original character identities, portraits, models, textures, dialogue, music, sound recordings, logos, campaign scripts, or other protected assets from Commandos.

Do not recreate the original missions verbatim.

Create original characters, fictional units, locations, mission scenarios, artwork, dialogue, audio, and narrative.

Use the original game as a reference for broad gameplay concepts and interaction principles. Ensure that the resulting product has its own recognizable visual identity, original content, and commercial-use-compatible assets.

# 2. GAMEPLAY DIRECTION SELECTION

Present these three options to the user before asking the ten questions.

## OPTION A — CLASSIC TACTICAL STEALTH

Focus on deliberate infiltration and squad specialization.

Features:

* Three to six controllable specialists.
* Individual selection and optional group selection.
* Real-time movement, walking, running, crawling, and hiding.
* Guard patrols and predictable but reactive observation systems.
* Sound distractions, concealment, disguises, and environmental interactions.
* Carefully constructed mission spaces with multiple infiltration routes.
* Mission objectives, optional objectives, extraction, and performance ratings.
* Limited resources and meaningful consequences for mistakes.

Design goal: Preserve the original's intense tactical puzzle-solving while providing modern 3D presentation and controls.

## OPTION B — LIVING BATTLEFIELD SANDBOX

Focus on a responsive battlefield and evolving mission situations.

Features:

* Reactive patrols and coordinated enemy investigations.
* Changing guard positions and security states.
* Weather, time of day, environmental conditions, and visibility.
* Dynamic objectives and optional opportunities.
* AI-generated mission variations, character conversations, intelligence leads, and complications.
* Persistent campaign consequences and mission continuity.
* Multiple viable approaches and extraction strategies.

Design goal: Each mission should feel like a coherent operation in a living world rather than a static puzzle.

Dynamic systems must follow deterministic gameplay rules. AI can propose events, but it must not directly rewrite the physics, combat rules, or authoritative world state.

## OPTION C — TACTICAL PLAN-AND-EXECUTE

Focus on coordination, synchronization, and precise multi-character planning.

Features:

* Pause-and-plan mode.
* Per-character command queues.
* Scheduled movements, interactions, and tactical actions.
* Synchronized actions and configurable execution speeds.
* A timeline showing the intended actions of each specialist.
* Contingency planning and conditional order cancellation.
* AI-generated scenarios designed to reward planning and coordination.

Design goal: Make the player feel like an operational commander coordinating a complex mission.

## Direction selection requirements

Ask the user to select A, B, or C, or request a hybrid.

Support a recommended hybrid of B's dynamic world and A's tactical control, with C's planning system available as an optional mode.

The chosen direction must materially affect the gameplay architecture and feature priorities.

Do not silently choose a direction on the user's behalf.

# 3. EXACTLY TEN CLARIFYING QUESTIONS

Ask these ten questions in the first response. Keep them concise and easy to answer.

1. **Gameplay direction:** Which do you prefer: A — Classic Tactical Stealth, B — Living Battlefield Sandbox, or C — Tactical Plan-and-Execute? Would you prefer a hybrid?

2. **Visual presentation:** Do you prefer a classic isometric camera with modern photorealistic rendering, a freely rotatable tactical camera, or a more cinematic 3D perspective?

3. **Historical setting:** Should the game use a fictional World War II-inspired setting, an entirely fictional modern conflict, or another historical period?

4. **Mission generation:** Should Gemini generate each mission from scratch, generate variations from curated mission templates, or combine templates with dynamic objectives and events?

5. **Squad composition:** How many specialists should normally be available per mission, and should the player choose the squad before deployment?

6. **Stealth and combat:** Should stealth be strongly preferred with lethal combat as a last resort, should nonlethal approaches be equally viable, or should players have greater tactical freedom?

7. **Difficulty and failure:** Should the game offer forgiving checkpoints, traditional mission restarts and squad-loss consequences, or a hardcore campaign with persistent casualties?

8. **AI-generated content:** Should Gemini generate text and structured mission data only, or also generate images and dialogue/audio assets? Which Google API capabilities and budget constraints are available?

9. **Deployment and accounts:** Should production support email/password, Google sign-in, or both? For local development, is a separate local PostgreSQL database sufficient, or must local mode also support the same authentication providers?

10. **Scope and priorities:** What should the first production milestone include: one polished vertical slice, a multi-mission campaign, or a broader playable sandbox? What are your target hardware, performance expectations, and approximate Google API budget?

Wait for the user's answers. Do not begin implementation before the interaction gate has been satisfied.

# 4. PRODUCT VISION

Build a browser-based tactical stealth game in which the player commands a small squad of highly specialized operatives in detailed 3D environments.

Every mission should combine:

* Tactical observation.
* Squad coordination.
* Enemy awareness and behavioral simulation.
* Environmental interaction.
* Meaningful equipment choices.
* Multiple possible solutions.
* Dynamic mission narrative.
* Original character dialogue.
* A coherent extraction and debriefing sequence.

The player should succeed through observation, timing, positioning, deception, and coordination rather than overwhelming firepower.

The game must be genuinely playable from beginning to end. Do not substitute decorative controls, static screenshots, fake gameplay, scripted video sequences, or placeholder buttons for working systems.

# 5. TECHNICAL ARCHITECTURE

Propose and document the final architecture after the clarification phase. Use stable, mutually compatible dependencies and lock their versions.

## Frontend

Preferred baseline:

* TypeScript.
* React.
* Next.js App Router.
* Three.js.
* React Three Fiber.
* Drei where appropriate.
* A lightweight state-management solution such as Zustand.
* A validated schema library such as Zod.
* Web Audio API or a suitable audio library.
* Responsive CSS and an accessible component system.

Use the browser as a real-time rendering client. Keep rendering and simulation code separate from the application interface.

The frontend must support:

* Authentication screens.
* User dashboard.
* Campaign and mission selection.
* Mission briefing.
* Fully playable 3D gameplay.
* Pause, settings, and accessibility controls.
* Save/load.
* Mission debriefing and progression.
* Error, loading, and AI-generation states.

## Production backend

Use:

* Vercel for the Next.js application and compatible server-side API endpoints.
* Neon PostgreSQL for persistent application data.
* A supported authentication solution with server-side session validation.
* Server-side Google Gemini API access.
* Versioned, validated API contracts.

Choose the authentication provider after the user's answers. Google sign-in and email/password must only be implemented according to the selected scope.

Keep API handlers short and compatible with Vercel's execution model. Do not assume a persistent server process, local disk, or unrestricted long-running background job.

If generation exceeds a serverless request's practical time limit, implement a durable job or resumable workflow. Do not keep a database transaction open while waiting for a model response.

## Local development

Provide Docker Compose that runs:

* The game application.
* A local PostgreSQL database.
* Any required local support services.
* Optional observability tools only if justified.

The local profile must be able to run without Neon credentials.

Provide:

* Health checks.
* Database migrations.
* Seed data.
* Persistent named volumes.
* A `.env.example`.
* A documented startup and shutdown process.
* A reset procedure that clearly warns before destroying data.
* Automated smoke tests.

The same application code and migration history should work against local PostgreSQL and Neon PostgreSQL.

Use environment-based configuration, not separate incompatible implementations.

## Architecture separation

Organize the code into clear modules, including:

* Rendering and scene management.
* Camera and input.
* Squad and character control.
* Navigation and pathfinding.
* Enemy AI and perception.
* Combat and damage.
* Stealth and sound simulation.
* World interactions.
* Mission runtime.
* AI content generation.
* Persistence and save/load.
* Authentication and authorization.
* Audio and dialogue.
* UI and HUD.
* Telemetry, error handling, and testing.

Keep gameplay rules independent of React components and presentation code.

# 6. THREE-DIMENSIONAL GRAPHICS AND ART DIRECTION

All gameplay world components must be real 3D objects.

This includes:

* Terrain and landscape.
* Buildings and interiors.
* Roads, paths, bridges, and fortifications.
* Trees, grass, rocks, and vegetation.
* Water and shoreline geometry.
* Vehicles and military equipment.
* Characters, enemies, and civilians.
* Props, weapons, tools, and interactable objects.
* Doors, gates, fences, ladders, machinery, and cover.
* Lights, shadows, fog, particles, and environmental effects.

Do not build the game using a 2D map with flat sprites pretending to be a 3D world. Do not render the battlefield as a single pre-rendered image.

2D UI overlays, portraits, icons, maps, textures, and briefing illustrations are permitted. They must complement a genuinely 3D game world.

## Visual quality requirements

Target a premium, cinematic tactical-game aesthetic:

* High-resolution PBR materials.
* Detailed normal, roughness, metallic, and ambient-occlusion maps where appropriate.
* Physically plausible lighting.
* Directional sunlight and dynamic shadows.
* Atmospheric fog and environmental depth.
* Detailed terrain transitions.
* Believable character proportions and animation.
* High-quality uniforms, equipment, buildings, vegetation, and props.
* Natural movement and contextual animations.
* Excellent composition and readable tactical silhouettes.

Use original, licensed, or procedurally generated assets. Never download or repurpose copyrighted game assets without authorization.

Use a coherent art direction rather than combining unrelated asset packs.

## Asset pipeline

Establish an asset manifest with:

* Asset identifier.
* Asset type.
* Source or generation method.
* License and attribution.
* Texture resolution.
* Material configuration.
* LOD settings.
* Memory budget.
* Required and optional status.

Support glTF/GLB models and appropriate texture formats.

Use multiple LOD levels, instancing, frustum culling, occlusion techniques where useful, texture compression, and lazy asset loading.

Create a fallback asset for every critical gameplay asset.

A missing optional asset must never crash the mission.

## Performance

Target:

* 60 FPS on a reasonable modern desktop with recommended graphics settings.
* A stable minimum 30 FPS on the declared lower-end supported configuration.
* Responsive camera movement and input.
* No noticeable freezes during ordinary gameplay.
* Predictable memory consumption.

Define explicit budgets for:

* Draw calls.
* Visible triangles.
* Texture memory.
* Shadow-casting lights.
* Animation updates.
* Active sound emitters.
* Enemy simulation frequency.

Use profiling rather than assuming that high-detail assets are automatically performant.

Provide graphics settings for resolution, antialiasing, shadows, effects, texture quality, and draw distance.

# 7. CAMERA, INPUT, AND TACTICAL INTERFACE

Implement a tactical camera with:

* Isometric default angle.
* Smooth panning.
* Edge scrolling as an optional setting.
* Keyboard camera controls.
* Mouse-wheel zoom.
* Configurable camera rotation.
* Camera collision and terrain awareness.
* Smooth focus on a selected specialist.
* Optional camera tracking.
* A reset-camera shortcut.

Prevent the camera from passing through terrain or revealing unintended areas.

## Selection

Support:

* Clicking a character to select them.
* Selecting characters from a squad portrait bar.
* Number-key selection.
* Modifier-assisted multi-selection.
* Drag-box selection if it fits the chosen control scheme.
* Clear selected-unit indicators.
* Group commands.
* A visible distinction between selected, active, injured, hidden, and incapacitated units.

## Movement

Implement:

* Click-to-move.
* Walk and run.
* Crouch and crawl.
* Context-sensitive climbing and traversal.
* Obstacle avoidance.
* Path previews.
* Movement cancellation.
* Queueable movement orders where supported.
* Explicit feedback when an order cannot be executed.

The movement system must use actual navigation and collision data. Characters must not teleport around obstacles, walk through solid buildings, or silently ignore blocked destinations.

## HUD

Build a polished tactical interface with:

1. Squad portraits, health, status, and equipment.
2. Contextual action panel.
3. Equipment and ability bar.
4. Tactical map with squad members, objectives, and discovered enemies.
5. Mission objective list.
6. Selected enemy information and line-of-sight controls.
7. Suspicion and alarm indicators.
8. Event log.
9. Pause/planning controls.
10. Audio, accessibility, and graphics settings.

Use a restrained military field-equipment aesthetic, strong typography, legible iconography, and subtle motion.

Do not clutter the battlefield with permanent labels. Use contextual highlights and progressive disclosure.

Provide keyboard remapping, adjustable UI scaling, subtitle controls, colorblind-friendly indicators, and reduced screen-shake options.

# 8. SQUAD SYSTEM

Create a modular specialist system. Exact squad size and abilities must follow the user's answers.

Potential original roles include:

* Infiltrator: quiet movement, climbing, concealment, and close-range stealth.
* Recon specialist: observation, enemy marking, long-range optics, and reconnaissance.
* Combat engineer: obstacle bypass, technical interactions, and specialized equipment.
* Field medic: stabilization, treatment, and casualty recovery.
* Marine operator: aquatic traversal, watercraft, and shoreline infiltration.
* Disguise and deception specialist: social infiltration, impersonation mechanics, and distraction.

These are role archetypes, not fixed copies of the original characters.

Every specialist must have:

* A distinct silhouette.
* An original personality and voice.
* Unique abilities and equipment.
* Meaningful limitations.
* A readable animation set.
* A defined inventory.
* A consistent gameplay role.
* Appropriate interactions with the environment.

Use a shared ability interface with specialized implementations.

Validate every ability against character capability, range, line of sight, inventory, cooldown, mission state, and target requirements.

Never let an AI-generated ability bypass these rules.

# 9. ENEMY AI AND STEALTH SIMULATION

Enemy behavior is fundamental to the experience and must be implemented as a real simulation.

## Perception

Model:

* Field of view.
* Visibility range.
* Occlusion by terrain and geometry.
* Character stance.
* Lighting and environmental visibility.
* Movement and exposure.
* Auditory perception.
* Distraction sources.
* Recognition of suspicious events.
* Optional disguise or identification mechanics.

Represent detection as a continuous suspicion system, not a single arbitrary Boolean.

Provide player-facing feedback that is useful without revealing every hidden variable.

## Enemy state machine

Implement a deterministic, testable state machine with states such as:

* Idle.
* Patrol.
* Observe.
* Suspicious.
* Investigate.
* Search.
* Challenge.
* Alerted.
* Combat.
* Return to post.
* Disabled or incapacitated.

Define valid transitions, transition conditions, timers, and recovery rules.

Enemies must remember relevant events within their configured memory limits.

## Squad and communication behavior

Where supported by the selected scope:

* Guards investigate unusual events.
* Nearby guards communicate discoveries.
* Alert propagation follows explicit rules.
* Reinforcements arrive only when mission logic permits.
* Patrols react to missing colleagues and security changes.
* Enemy searches cover relevant locations rather than moving randomly.

Do not simulate every distant enemy at full frame rate. Use adaptive update frequencies and deterministic simulation steps.

## Sound propagation

Sound must have gameplay consequences.

Calculate sound propagation based on:

* Source intensity.
* Distance.
* Terrain and walls.
* Material and acoustic attenuation.
* Environmental noise.
* Relevant doors or barriers.
* Event-specific sound profiles.

Footsteps on metal, grass, gravel, snow, and indoor flooring should sound different and create different detection opportunities.

Do not use sound radius as a purely decorative circle. It must be connected to the same perception model used by the enemy AI.

## Alarm escalation

Define explicit alarm levels and their effects.

Examples:

* Routine patrol.
* Local suspicion.
* Active investigation.
* Sector alert.
* Full mission alert.

Each transition must be observable and must have meaningful gameplay consequences.

Some missions may impose an alarm failure condition, but this must be clearly communicated in the briefing.

# 10. CORE GAMEPLAY LOOP

A complete mission must follow a reliable loop:

1. Mission selection.
2. Mission briefing.
3. Squad selection and equipment preparation, if enabled.
4. 3D mission loading.
5. Initial reconnaissance.
6. Tactical execution.
7. Optional objectives and dynamic events.
8. Primary objective completion.
9. Extraction or other explicit completion condition.
10. Debriefing and scoring.
11. Persistent campaign update.
12. Next mission or return to the dashboard.

## Objective system

Support objective types such as:

* Reach a location.
* Acquire intelligence.
* Disable a facility.
* Rescue a captive.
* Sabotage equipment.
* Recover an item.
* Evacuate a friendly unit.
* Secure an extraction zone.
* Complete an optional task.

Represent objectives as validated data with prerequisites, completion conditions, failure conditions, and presentation metadata.

Support objective dependencies and alternative success paths.

Every generated mission must have a coherent main objective, a valid way to complete it, and a clear completion condition.

## Tactical consequences

Possible consequences include:

* Increased enemy suspicion.
* Patrol rerouting.
* Lost opportunities.
* Limited ammunition.
* Injured specialists.
* Optional-objective failure.
* Additional extraction challenges.

Mission failure must be handled explicitly. Provide retry, reload, or campaign recovery behavior according to the selected difficulty.

Avoid unwinnable mission states unless the game explicitly presents them as failure.

# 11. GOOGLE GEMINI — AI-GENERATED GAMEPLAY

Use the Google Gemini API as the narrative and mission-content engine.

Use the current supported Google Gen AI SDK and an appropriate model selected after researching current availability, capabilities, pricing, latency, and structured-output support.

Do not hardcode an obsolete model name or assume a particular model will remain available indefinitely.

Read the API key from a server-only environment variable such as:

GOOGLE_API_KEY

The exact variable name may be changed during implementation, but it must never be exposed to browser code.

Never embed the key in:

* Client-side JavaScript.
* HTML.
* Public environment variables.
* Source control.
* Logs.
* Error messages.
* Client-visible API responses.

Use server-side calls only.

## What the AI should generate

At mission creation time, generate a structured mission package containing:

* Original mission title.
* Narrative premise.
* Historical or fictional setting.
* Map theme and environmental conditions.
* Main objective.
* Optional objectives.
* Required extraction condition.
* Specialist recommendations.
* Enemy composition and patrol archetypes.
* Tactical opportunities.
* Interactable objects.
* Potential complications.
* Mission-specific dialogue.
* Briefing and debriefing text.
* Difficulty parameters.
* Replay variation parameters.

At gameplay time, allow Gemini to generate context-aware narrative events such as:

* New intelligence discovered.
* An optional objective revealed.
* A radio transmission.
* A character-specific exchange.
* A new escape opportunity.
* A plausible mission complication.
* A change in narrative context caused by player decisions.

All such events must be proposals that pass through a server-side validation and gameplay-authorization layer.

## AI-generated worlds must be playable

Do not ask the model to return an unbounded natural-language description and then pretend it represents a functioning level.

Generate a structured mission specification using a versioned schema.

The specification must describe a level that the game engine can actually construct using available components.

Example schema outline:

{
"schemaVersion": 1,
"missionId": "generated-id",
"title": "Original mission title",
"theme": "coastal-industrial",
"environment": {
"timeOfDay": "night",
"weather": "light-rain"
},
"terrain": {
"layoutTemplate": "coastal-compound",
"seed": 123456
},
"objectives": [
{
"id": "primary-1",
"type": "recover-intelligence",
"required": true
}
],
"spawnPoints": [],
"patrols": [],
"interactables": [],
"extractionPoints": [],
"dialogue": [],
"difficulty": {
"preset": "standard"
}
}

This is illustrative, not a complete schema. Build and version the actual schema.

Every generated entity must reference an allowed archetype or asset identifier. Do not permit arbitrary model-provided code, URLs, JavaScript, shaders, executable scripts, or unrestricted geometry instructions.

## Procedural level generation

Implement a deterministic procedural level generator.

The generator must:

1. Select a compatible level template.
2. Apply validated layout parameters.
3. Place buildings, cover, obstacles, roads, vegetation, patrols, and objectives.
4. Generate navigation data.
5. Calculate line-of-sight and collision information.
6. Place squad spawn points and extraction zones.
7. Validate all mandatory objectives.
8. Run automated reachability checks.
9. Confirm that the mission is winnable.
10. Produce a reproducible seed and generation report.

Start with a library of reusable modular 3D components and a handful of robust level templates.

The AI should compose new missions from these components rather than attempting to invent arbitrary 3D models and collision geometry from scratch on every turn.

Add more templates and procedural variation after the core generation pipeline is stable.

## Runtime AI rules

The AI must not directly:

* Move characters.
* Apply damage.
* Decide hit results.
* Teleport entities.
* Bypass collision.
* Alter inventory without an authorized event.
* Change a player's account or saved game.
* Execute arbitrary code.
* Change the authoritative mission state outside validated commands.

The AI can propose a narrative event or gameplay event. A deterministic rules engine must decide whether the event is permitted and apply it safely.

The game engine is the authority for all gameplay state.

## Structured output and validation

For every AI response:

* Parse structured output.
* Validate against the current schema.
* Enforce string, array, and object-size limits.
* Reject unknown entity types.
* Reject invalid coordinates and impossible placements.
* Reject missing mandatory fields.
* Check all objective dependencies.
* Verify squad capability requirements.
* Verify navigation and extraction reachability.
* Apply rate limits and generation budgets.
* Store a generation version and seed.
* Record validation failures without leaking secrets.

If validation fails, perform a limited repair attempt and then use a known-good template.

Never let repeated model errors create infinite retries.

## Latency and fallback behavior

Implement:

* A mission-generation loading screen.
* Progress stages that accurately reflect the workflow.
* Request timeouts.
* Bounded retries with backoff for retryable errors.
* Idempotency for generation requests.
* Cancellation where possible.
* Per-user rate limits.
* Per-user and per-campaign generation budgets.
* Caching where appropriate.
* Reuse of successfully generated missions.
* A deterministic fallback mission.

The player must not be trapped on an indefinite loading screen.

If Gemini is unavailable, allow the player to start a previously generated or deterministic mission.

## Images and audio generation

Treat generated images and audio as optional, budgeted subsystems.

If the selected Google services support the desired generation capability, evaluate them separately for:

* Reference images.
* Briefing illustrations.
* Original character portraits.
* Dialogue voice generation.
* Other explicitly approved assets.

Verify that each chosen service, model, and output format is currently supported.

Do not assume that a general-purpose Gemini text model automatically generates images, music, or audio.

Never block real-time gameplay waiting for an image or voice-generation request.

Cache generated assets using content hashes and metadata. Validate formats and dimensions before use. Serve media through a controlled storage and delivery mechanism.

Maintain a complete text-subtitle fallback for every spoken line.

# 12. DIALOGUE AND AUDIO SYSTEM

Implement an original, event-driven audio system.

## Audio layers

1. Ambient environment.
2. Music.
3. Character voices.
4. Enemy voices.
5. Tactical effects.
6. UI feedback.
7. Mission briefing and debriefing.

Provide independent volume controls for each category.

## Dialogue architecture

Create a dialogue event system with:

* Speaker ID.
* Context.
* Trigger condition.
* Priority.
* Cooldown.
* Subtitle.
* Optional voice asset.
* Playback state.
* Cancellation and interruption rules.

Examples:

* A specialist acknowledges an order.
* A character warns about a nearby patrol.
* A guard comments on a suspicious noise.
* A character reacts to weather or terrain.
* A radio operator reports a change in mission status.
* The squad reacts to an objective being completed.

Avoid repetitive voice lines by tracking recent playback history and applying contextual cooldowns.

Dialogue must not obscure urgent tactical information.

## Audio quality

Use spatial audio or an appropriate positional-audio system where supported.

Implement:

* Distance attenuation.
* Directional audio cues.
* Indoor and outdoor ambience.
* Occlusion or muffling where appropriate.
* Footstep variation by surface.
* Distinct enemy alert sounds.
* Adaptive music transitions.
* Subtitle synchronization.

Create original sound effects and music or use assets with documented licenses suitable for the intended distribution.

The audio system must work even when optional AI voice generation is unavailable.

# 13. ACCOUNT MANAGEMENT AND PERSISTENCE

Implement secure user management appropriate to the selected authentication design.

## Account requirements

* Registration and login where applicable.
* Logout.
* Session expiration and renewal.
* Protected routes and APIs.
* Server-side authorization.
* Account-level data isolation.
* Appropriate password handling if passwords are supported.
* Secure cookie configuration.
* Rate limiting for authentication-sensitive operations.
* User-friendly error states.

Do not implement a custom cryptographic authentication scheme when a mature supported authentication solution is appropriate.

## Persistent data

Design relational tables for the applicable entities:

* Users and authentication identities.
* User preferences.
* Campaigns.
* Missions.
* Mission generation metadata.
* Save slots.
* Versioned save-state payloads.
* Mission completion history.
* Squad progression.
* Inventory and equipment.
* AI-generation jobs, if required.
* Usage accounting.
* Audit events for security-sensitive operations.

Use migrations, foreign keys, unique constraints, indexes, and transactions where appropriate.

Use explicit ownership checks on every operation that reads or mutates user-specific data.

## Save/load

Save a complete, versioned snapshot of the authoritative gameplay state, including:

* Mission identifier and generation seed.
* World state.
* Character positions and statuses.
* Enemy states and patrol progress.
* Objective completion state.
* Inventory.
* Mission timers.
* Relevant AI-generated events.
* RNG state where necessary for reproducibility.
* Save schema version.

Do not persist GPU resources or Three.js objects directly. Persist serializable domain data and reconstruct the scene.

Implement:

* Manual save.
* Quick save.
* Load.
* Autosave at appropriate checkpoints.
* Save version migrations.
* Validation of loaded data.
* Recovery from invalid or partially written saves.

Save creation must be atomic. Loading a save must restore a coherent state rather than mixing old and new mission data.

Support resumable campaigns and mission replay.

## Database portability

Use the same logical schema on Neon and local PostgreSQL.

Document any provider-specific authentication or connection differences.

Use appropriate connection pooling for serverless production environments.

Never connect the browser directly to PostgreSQL.

# 14. SECURITY AND RELIABILITY

Treat security as a production requirement.

Implement:

* Strict request validation.
* Server-side authorization.
* Account ownership checks.
* Rate limiting.
* Input-size limits.
* Safe error responses.
* Secure secret management.
* Dependency auditing.
* Database migrations and backups appropriate to the deployment.
* Protection against prompt injection in generated content.
* Safe rendering of user-generated and AI-generated text.
* Safe media processing.
* Content moderation appropriate to the product.
* Resource limits on generated missions.
* Logging that avoids passwords, tokens, and API keys.

Treat AI output as untrusted input.

Do not allow generated content to execute code or bypass authorization.

Ensure a player cannot read another user's saves, campaigns, generated mission data, or private preferences by changing an identifier.

Add a documented threat model and security checklist.

# 15. USER EXPERIENCE AND GAME FLOW

Build a polished application around the game.

## Main menu

Include:

* Continue campaign.
* New campaign.
* Mission selection.
* Generated mission.
* Load game.
* Settings.
* Controls and tutorial.
* Account and profile.
* Exit or return-to-dashboard behavior appropriate to the browser.

## Mission briefing

Present:

* Narrative context.
* Primary and optional objectives.
* Squad roster.
* Available equipment.
* Known enemy positions or intelligence.
* Terrain overview.
* Known restrictions.
* Extraction information.
* Relevant mission warnings.

The player must be able to review the briefing again during the mission.

## Tutorials

Create a playable tutorial that teaches:

* Camera movement.
* Character selection.
* Movement and stance.
* Enemy vision.
* Sound and distractions.
* Specialist abilities.
* Objective interaction.
* Extraction.
* Save and load.

Use contextual instruction and interactive objectives rather than a wall of text.

## Mission debriefing

Display:

* Main objective outcome.
* Optional objective outcomes.
* Time taken.
* Squad casualties and injuries.
* Detection and alarm events.
* Equipment usage.
* Mission score.
* Campaign consequences.
* A concise, original AI-generated narrative summary when available.

AI-generated scoring explanations must reflect actual gameplay data. The model must not invent player accomplishments.

# 16. ACCESSIBILITY AND INPUT QUALITY

Provide:

* Remappable keyboard controls.
* Mouse sensitivity options.
* Configurable camera scrolling.
* UI scaling.
* Subtitle size and background settings.
* Independent audio volume.
* Colorblind-friendly tactical indicators.
* Reduced camera shake.
* Clear warnings that do not rely solely on color.
* Pause and planning options according to the chosen gameplay direction.

Support common desktop resolutions and test keyboard/mouse input thoroughly.

Document mobile and gamepad support as implemented, limited, or intentionally out of scope. Do not claim support that has not been tested.

# 17. TESTING STRATEGY

Create an automated test suite that exercises actual game behavior.

## Unit tests

Test:

* Character ability validation.
* Movement-order validation.
* Detection and suspicion calculations.
* Sound propagation.
* Enemy state transitions.
* Objective dependencies.
* Alarm escalation.
* Mission scoring.
* Save-state serialization.
* Schema validation.
* Authorization checks.
* AI-generated event validation.

## Integration tests

Test:

* Authentication.
* Database migrations.
* Campaign creation.
* Mission generation.
* Fallback mission generation.
* Save/load.
* Campaign progression.
* API error handling.
* Generation quotas.
* Ownership isolation.

## Gameplay tests

Create deterministic scenarios that verify:

* A patrol sees an exposed character.
* A wall blocks sight.
* A noise triggers investigation when in range.
* A distraction redirects a guard when appropriate.
* A character cannot use another specialist's restricted ability.
* A mandatory objective can be completed.
* Extraction succeeds when its requirements are met.
* Invalid missions are rejected before gameplay begins.
* A saved mission can be restored consistently.

## Browser tests

Use a suitable browser automation tool to verify:

* Registration and login flows.
* Navigation between screens.
* Mission loading.
* Character selection and movement.
* Tactical interface interaction.
* Pause and resume.
* Save and load.
* Error and fallback states.

Do not treat the appearance of a canvas as proof that the game is playable.

## Performance tests

Measure:

* Frame rate.
* Rendering time.
* Memory consumption.
* Number of active entities.
* Navigation cost.
* AI generation latency.
* API request frequency.
* Database query latency.

Create repeatable test scenarios and document the hardware and browser used.

# 18. VERCEL AND DOCKER DELIVERY

## Vercel production deployment

Provide:

* Production build configuration.
* Required environment variables.
* Database migration procedure.
* Authentication callback configuration.
* Secure server-side Google API integration.
* Health or readiness checks where applicable.
* Error monitoring guidance.
* Logging and usage-budget guidance.
* A deployment guide.
* A rollback procedure.
* A production smoke-test checklist.

Do not assume the Vercel deployment filesystem is persistent.

Do not expose server secrets through client bundles.

Ensure the application works under the actual execution constraints of the chosen Vercel runtime.

## Docker Compose

Provide a working compose configuration for local development.

Include:

* Application container.
* PostgreSQL container.
* Persistent database volume.
* Health checks.
* Dependency readiness.
* Local environment configuration.
* Database initialization or migration workflow.
* Optional development hot reload.
* Production-like build mode.

Document commands for:

* Starting the stack.
* Viewing logs.
* Running migrations.
* Running tests.
* Resetting local development data.
* Stopping the stack.
* Rebuilding containers.

The local game must start without requiring a Neon account. Google API access may remain optional through the deterministic fallback mode.

## Required environment configuration

Provide a `.env.example` with documented placeholders for the relevant settings, such as:

DATABASE_URL=
GOOGLE_API_KEY=
AUTH_SECRET=
AUTH_URL=
NEXT_PUBLIC_APP_URL=

Include only variables actually required by the selected implementation. Clearly distinguish public variables from server-only secrets.

Never put GOOGLE_API_KEY or other server secrets in a variable prefixed with NEXT_PUBLIC_.

Do not commit real secrets.

# 19. PROJECT STRUCTURE AND DOCUMENTATION

Choose a maintainable monorepo or equivalent structure.

A possible layout is:

apps/
web/
game-api/

packages/
game-engine/
game-content/
game-ui/
shared-schemas/
database/
ai-generation/
audio/

assets/
models/
textures/
animations/
audio/
ui/

tests/
unit/
integration/
browser/
gameplay/

infra/
docker/
vercel/

docs/
architecture/
gameplay/
security/
operations/

Adjust the layout to avoid unnecessary packages or artificial service boundaries.

Provide:

* README.md.
* Architecture documentation.
* Game design document.
* AI-generation design document.
* Database schema documentation.
* API documentation.
* Asset attribution and license register.
* Local development guide.
* Production deployment guide.
* Troubleshooting guide.
* Testing instructions.
* Known limitations.
* A roadmap for future missions and features.

# 20. IMPLEMENTATION MILESTONES

After the user has approved the plan, implement incrementally.

## Milestone 1 — Foundation

* Establish repository structure.
* Set up the frontend and 3D rendering pipeline.
* Add environment configuration.
* Add Docker Compose and PostgreSQL.
* Configure database migrations.
* Implement the initial application shell.
* Add automated checks.

Acceptance criteria:
The application builds, starts locally, connects to PostgreSQL, and provides a functional interface.

## Milestone 2 — Playable 3D vertical slice

Build one original mission with:

* A detailed 3D environment.
* Multiple controllable specialists.
* Functional movement and pathfinding.
* Enemy patrols.
* Line-of-sight detection.
* Basic sound detection.
* Specialist interactions.
* Primary and optional objectives.
* Extraction and mission failure.
* A tactical HUD.
* Basic original audio.

Acceptance criteria:
A player can complete the mission through actual gameplay, and the core systems can be tested deterministically.

## Milestone 3 — Mission generation

* Integrate Google Gemini server-side.
* Create the versioned mission schema.
* Implement procedural level construction.
* Add navigation and reachability validation.
* Add AI-generated briefings and dialogue.
* Add event validation and fallback behavior.
* Add generation quotas and usage tracking.

Acceptance criteria:
Generated missions are playable, validated, reproducible, and recoverable when generation fails.

## Milestone 4 — Persistence and user management

* Implement the selected authentication flow.
* Add campaigns and save slots.
* Persist mission state.
* Implement save/load and migration support.
* Add ownership checks and security tests.

Acceptance criteria:
Users can resume their own saved games without accessing another user's data.

## Milestone 5 — Production polish

* Improve models, textures, animation, lighting, and audio.
* Complete the selected UI/UX direction.
* Add tutorials and settings.
* Add robust error handling.
* Profile performance.
* Run security and dependency checks.
* Test local and production configurations.

Acceptance criteria:
The game satisfies the documented performance targets and has no known critical gameplay blockers.

## Milestone 6 — Release readiness

* Run all automated tests.
* Build the production artifact.
* Verify database migrations.
* Test the fallback path without Google API credentials.
* Validate the Docker Compose workflow.
* Validate the Vercel deployment configuration.
* Verify environment-variable handling.
* Document deployment, rollback, and troubleshooting.

Acceptance criteria:
A developer can follow the documentation to launch the local game, and the production deployment can be configured without undocumented manual steps.

# 21. ENGINEERING RULES

Follow these rules throughout the project:

1. Do not generate the entire application as one giant file.
2. Do not substitute pseudocode for required production functionality.
3. Do not leave core interactions as TODOs.
4. Do not implement fake authentication or fake persistence.
5. Do not hardcode generated mission results as though they came from Gemini.
6. Do not make gameplay depend on continuous network access to an AI model.
7. Do not trust AI-generated output.
8. Do not expose server-side credentials.
9. Do not claim tests passed unless they actually ran.
10. Do not claim Vercel deployment succeeded unless it was verified.
11. Do not introduce unnecessary microservices.
12. Do not use unlicensed proprietary game assets.
13. Do not silently ignore a failed build or test.
14. Do not optimize blindly without profiling.
15. Do not sacrifice core gameplay correctness for visual effects.

Use clear types, small modules, explicit state transitions, deterministic tests, and structured error handling.

Keep a living implementation checklist and update it after each milestone.

# 22. DEFINITION OF DONE

The project is complete only when all applicable acceptance criteria are met.

The delivered game must have:

* A genuinely playable 3D tactical stealth mission.
* Detailed and coherent 3D environments.
* Functional squad control.
* Specialist abilities.
* Real enemy perception and investigation.
* Working objectives and extraction.
* Functional tactical UI.
* Original audio and dialogue.
* Google Gemini-powered mission generation.
* Validated AI-generated events.
* A reliable non-AI fallback.
* Persistent accounts and saved games.
* Neon production configuration.
* Working local Docker Compose configuration.
* Automated tests.
* Documented security controls.
* Deployment and troubleshooting documentation.
* No critical broken gameplay path.

A beautiful menu or impressive screenshot is not sufficient.

Prioritize a complete, reliable vertical slice before expanding the mission catalog. Every additional feature must build on tested gameplay systems.

# FINAL INSTRUCTION

Start with Phase 0.

Present the three gameplay directions and exactly ten clarifying questions.

Wait for the user's answers.

After the answers, prepare and obtain approval for the architecture and implementation plan.

Only then begin implementation.

