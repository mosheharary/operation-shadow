// Prompts, casting and content for the Operation Shadow pre-production samples
// (art / music / dialogue direction review). All names, factions and characters are
// original placeholders and can be changed.

export const MODELS = {
  text: 'gemini-3.8-flash',
  image: 'gemini-nano-banana-2.1',
  tts: 'gemini-3.8-flash-tts',
  song: 'lyria-3.5',
  clip: 'lyria-3-clip-preview',
};

// Published prices (USD) used only for the cost estimate shown in the gallery.
export const PRICES = {
  imageBySize: { '1K': 0.0336, '2K': 0.0504, '4K': 0.113 },
  song: 0.08,
  textPerMTokIn: 0.75,
  textPerMTokOut: 3.75,
  ttsPerMTokIn: 0.5,
  ttsPerMTokOut: 9.0,
};

export const WORLD = `Operation Shadow is an original tactical stealth game set in a fictional 1940s-inspired world.
The Free Coalition resists the Iron Dominion, an authoritarian power occupying the Northern Reach:
a cold land of fjords, fishing harbors, alpine passes and rail junctions. The player commands
Shadow Section, a six-person special-operations team guided over the radio by HQ, call-sign
LANTERN (Colonel Ruth Ashdown, a seasoned, dry-witted intelligence officer). Iron Dominion soldiers
wear slate-grey greatcoats with rust-red collar tabs; most sentries are cold, bored conscripts;
officers are procedural and severe.`;

export const CHARACTERS = {
  LANTERN: {
    name: 'Colonel Ruth Ashdown',
    role: 'HQ handler (radio)',
    voice: 'Gacrux',
    persona: 'Seasoned intelligence officer. Measured, authoritative, dry wit, quietly protective of her team.',
    ttsStyle: 'measured and authoritative, like a commander on a field radio',
  },
  MOTH: {
    name: 'Sgt. Elias Varga',
    role: 'Infiltrator',
    voice: 'Enceladus',
    persona:
      'Former mountain guide. Soft-spoken, economical with words, bone-dry humor, never raises his voice. Silent takedowns, climbing, restraints, noise lures.',
    ttsStyle: 'quiet, low and controlled, close to a whisper',
    look: 'lean man in his thirties, dark knit watch cap, charcoal wool sweater, climbing rope coiled over one shoulder, knife sheath, soft-soled boots, face streaked with dark camouflage cream',
  },
  OWL: {
    name: 'Lt. Hanna Brekke',
    role: 'Recon / Marksman',
    voice: 'Erinome',
    persona:
      'Former cartographer. Precise, patient, clipped; reports numbers and bearings. Binoculars, tagging enemies, suppressed rifle with very few rounds, tranquilizer darts.',
    ttsStyle: 'crisp, precise and calm',
    look: 'woman in her late twenties, olive field cap, olive smock with a leather map case, long scoped rifle slung across her back, binoculars on her chest',
  },
  BADGER: {
    name: "Cpl. Desmond 'Dez' Okafor",
    role: 'Combat Engineer',
    voice: 'Algenib',
    persona:
      'Ex-shipyard welder. Big-hearted, gruff and cheerful; talks affectionately to machines and charges. Wire cutters, lockpicks, demolition charges, sabotage.',
    ttsStyle: 'warm, gruff and good-humored',
    look: 'broad-shouldered man in his forties, dented steel helmet, heavy canvas backpack bristling with tools, wire cutters on his belt, satchel charges, rolled-up sleeves',
  },
  FOX: {
    name: 'Celeste Marchand',
    role: 'Deception Specialist',
    voice: 'Despina',
    persona:
      'Former stage actress. Theatrical, charming, quick-witted; relishes playing a role. Disguises, distracting guards with conversation, sedative syringe, forged papers.',
    ttsStyle: 'smooth, playful and confident',
    look: "elegant woman in her thirties, belted trench coat over civilian clothes, dark beret, leather satchel, a soft slate-blue enemy officer's kepi tucked under one arm whose only badge is a small silver three-pointed crown",
  },
  HERON: {
    name: 'Dr. Ivo Lindqvist',
    role: 'Field Medic',
    voice: 'Schedar',
    persona:
      'Former country doctor. Calm, compassionate, wry gallows humor, steady under fire. Revives and treats the wounded, chloroform, smoke canisters.',
    ttsStyle: 'calm, gentle and reassuring',
    look: 'tall, thin man in his fifties, round wire spectacles, white armband with a green cross, worn medical satchel, rolled canvas stretcher on his back',
  },
  OTTER: {
    name: 'PO Kai Rennick',
    role: 'Marine Operator',
    voice: 'Zubenelgenubi',
    persona:
      "Fisherman's son. Laid-back, cocky, nautical slang, loves cold water. Swimming and diving, inflatable boat, harpoon gun.",
    ttsStyle: 'relaxed, cocky and easy-going',
    look: 'wiry man in his twenties, dark rubberized diving suit with the hood rolled down, swim fins clipped to his belt, short harpoon gun, coiled line, packed inflatable dinghy',
  },
  GUARD_A: {
    name: 'Iron Dominion sentry (veteran)',
    role: 'Enemy',
    voice: 'Charon',
    persona: 'Weary older sentry who has seen too many cold nights.',
    ttsStyle: 'tired, grumbling and low',
  },
  GUARD_B: {
    name: 'Iron Dominion sentry (conscript)',
    role: 'Enemy',
    voice: 'Fenrir',
    persona: 'Nervous young conscript, jumpy at every sound.',
    ttsStyle: 'nervous, jumpy and young',
  },
};

export const SQUAD = ['MOTH', 'OWL', 'BADGER', 'FOX', 'HERON', 'OTTER'];

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const DIORAMA = `Art direction for "Operation Shadow", an original 1940s-inspired tactical stealth game.
Stylized-realistic miniature diorama look, as if a detailed hand-crafted tabletop model were photographed
with a subtle tilt-shift lens. High-angle three-quarter isometric camera (about 50 degrees pitch).
Physically based materials with hand-painted detail, soft global illumination, muted palette of slate blue,
olive drab, weathered stone and rust red, accented by warm lamp light. Crisp, readable silhouettes.
Game concept art quality. Fictional world: no real-world flags, insignia or symbols, no text.`;

const PORTRAIT = `HUD character portrait for "Operation Shadow", an original 1940s-inspired stealth game.
Head and shoulders, three-quarter view, painted in a 1940s gouache illustration style with subtle film grain,
muted palette, soft key light from the upper left, plain dark slate-blue background, consistent framing
for a matching set of six portraits. No text, no frame, no real-world insignia.`;

const portrait = (id) => ({
  id: `portrait_${id.toLowerCase()}`,
  group: 'Squad portraits',
  title: `${id} — ${CHARACTERS[id].name}, ${CHARACTERS[id].role}`,
  aspect: '1:1',
  size: '1K',
  prompt: `${PORTRAIT}\nSubject: ${CHARACTERS[id].look}. Personality to convey: ${CHARACTERS[id].persona.split('.').slice(0, 2).join('.')}.`,
});

export const IMAGE_JOBS = [
  {
    id: 'env_coastal_night',
    group: 'Environments',
    title: 'Coastal theme — Varrow Harbor at night',
    aspect: '16:9',
    size: '2K',
    prompt: `${DIORAMA}
Scene: Varrow Harbor at night in light rain and fog. A small fishing village with stone quays, wooden piers and
moored fishing boats; a fortified gun battery with concrete emplacements on the cliff above; two searchlights
sweeping the dark water; enemy sentries in long slate-grey greatcoats patrolling with lanterns. One sentry's field
of view is shown as a faint translucent two-tone green cone projected on the wet cobblestones (brighter near zone,
darker far zone), like a tactical game overlay. Three tiny allied commandos crouch in shadow beside crates at the
water's edge.`,
  },
  {
    id: 'env_alpine_day',
    group: 'Environments',
    title: 'Alpine theme — Whitecrown Ridge radar outpost',
    aspect: '16:9',
    size: '2K',
    prompt: `${DIORAMA}
Scene: a radar outpost on a snowy mountain saddle under overcast daylight. Timber barracks with snow-laden roofs, a
steel lattice tower carrying a large radar dish, barbed-wire fences, a sandbagged machine-gun nest, a wooden
watchtower with a searchlight, pine forest at the edges, and fresh footprint trails crossing the snow. A patrol of
three enemy soldiers in grey greatcoats walks a perimeter path.`,
  },
  {
    id: 'env_rail_dusk',
    group: 'Environments',
    title: 'Rail theme — Corvan Junction depot at dusk',
    aspect: '16:9',
    size: '2K',
    prompt: `${DIORAMA}
Scene: a rail depot at dusk in drizzle. A black steam locomotive with freight wagons, a brick engine shed, a timber
water tower, a fuel depot with rows of red barrels, warehouses, signal gantries, puddles reflecting warm sodium
lamps, steam drifting through the yard. Sentries stand at a checkpoint barrier while a supply truck is unloaded.`,
  },
  {
    id: 'key_art',
    group: 'Key art & UI',
    title: 'Title key art',
    aspect: '16:9',
    size: '2K',
    prompt: `Painterly cinematic key art for "Operation Shadow", an original 1940s-inspired tactical stealth game.
Six silhouetted commandos of Shadow Section stand on a rocky cliff above a fog-bound harbor at night, lit by
moonlight and a distant sweeping searchlight, under a dramatic cloudy sky. Muted slate-blue palette with warm
highlights. The game title "OPERATION SHADOW" appears in bold, weathered stencil lettering across the top.
Fictional world: no real-world flags, insignia or symbols.`,
  },
  {
    id: 'hud_mockup',
    group: 'Key art & UI',
    title: 'In-game HUD concept mockup (target mood, not real engine output)',
    aspect: '16:9',
    size: '2K',
    prompt: `Concept mockup of the in-game screen of "Operation Shadow", an original 1940s-inspired tactical stealth game.
The harbor at night seen from the high isometric tactical camera, rendered as a stylized-realistic miniature diorama.
A clean, restrained military field-equipment style HUD sits around the screen edges only: six small character
portraits with thin health bars along the top-left, a compact objectives panel at the top-right, an alarm-level
indicator at the top-center, an ability bar with simple icons at the bottom-center, and a parchment-style tactical
minimap at the bottom-right. On the ground, a translucent two-tone green vision cone from one guard; one selected
commando with a subtle ring marker and a dotted path-preview line. No real-world insignia.`,
  },
  {
    id: 'squad_lineup',
    group: 'Characters',
    title: 'Shadow Section — character lineup',
    aspect: '16:9',
    size: '2K',
    prompt: `Character concept lineup sheet for "Operation Shadow", an original 1940s-inspired stealth game, on a neutral
warm-grey background. The six members of Shadow Section stand side by side, full body, front view, each with a
distinct silhouette, with a small label plate under each figure reading MOTH, OWL, BADGER, FOX, HERON, OTTER:
MOTH: ${CHARACTERS.MOTH.look}.
OWL: ${CHARACTERS.OWL.look}.
BADGER: ${CHARACTERS.BADGER.look}.
FOX: ${CHARACTERS.FOX.look}.
HERON: ${CHARACTERS.HERON.look}.
OTTER: ${CHARACTERS.OTTER.look}.
Painted concept-art style, muted 1940s palette, consistent scale. No real-world insignia.`,
  },
  {
    id: 'enemy_uniforms',
    group: 'Characters',
    title: 'Iron Dominion — uniform design sheet',
    aspect: '16:9',
    size: '2K',
    prompt: `Uniform design sheet for the fictional Iron Dominion army in "Operation Shadow": an invented army that is
deliberately not based on any real nation's uniforms. Painted concept-art style on a neutral background, with a
distinctive silhouette that cannot be mistaken for any historical army. Three full-body figures:
- a weary conscript sentry in a double-breasted slate-blue greatcoat with rust-red collar tabs and brass toggle
  fastenings, wearing a tall rounded steel helmet with a raised central ridge running front to back and a narrow flat
  brim all around, carrying a bolt-action rifle;
- a sergeant in a short slate-blue field jacket with a rust-red sash, the same ridged helmet, carrying a lantern;
- an officer in a long slate-blue cape-coat over a high-collared tunic, wearing a soft flat-topped kepi with a short
  brim, with a small silver emblem of a stylized iron crown with three points.
Add labelled close-up callouts of the iron-crown emblem, the rust-red collar tabs, the ridged helmet and the kepi.
The iron crown is the only emblem anywhere on the sheet.`,
  },
  ...SQUAD.map(portrait),
  {
    id: 'briefing_map',
    group: 'Briefing',
    title: 'Briefing dossier — Operation Silent Tide',
    aspect: '4:3',
    size: '2K',
    prompt: `In-world mission briefing dossier for "Operation Silent Tide" in the original game "Operation Shadow".
A hand-drawn top-down tactical map of a fictional fishing harbor on aged paper: coastline, piers, village streets, a
cliff-top gun battery, a radio hut, enemy patrol routes as dashed lines, a red insertion route arriving from the sea,
and an extraction buoy marked with a circle. Pinned black-and-white reconnaissance photographs, a short typed
objective list, a paperclip and a faint coffee stain. 1940s field-intelligence aesthetic. No real-world insignia.`,
  },
];

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------

const NO_VOCALS = 'Instrumental only, no vocals, no choir, no lyrics.';

export const MUSIC_JOBS = [
  {
    id: 'music_main_theme',
    title: 'Main theme (menu)',
    model: MODELS.song,
    prompt: `Original main menu theme for a 1940s-inspired tactical stealth game. D minor, 92 BPM. A solo muted trumpet
states a heroic but melancholy melody over low strings and soft snare-drum rolls; it builds with French horns and
timpani to a noble climax, then fades to a lone piano echo of the theme. Classic 1940s cinematic orchestral score with a
warm vintage recording character. About two minutes. ${NO_VOCALS}`,
  },
  {
    id: 'music_stealth',
    title: 'Stealth exploration (loopable)',
    model: MODELS.song,
    prompt: `Stealth exploration music for a 1940s-inspired tactical stealth game. D minor, 84 BPM. Sparse and tense:
pizzicato basses, ticking rim clicks, low sustained string clusters, distant muted horn calls and occasional celesta
motifs. Restrained dynamics so dialogue stays clear; no big climaxes; it ends quietly so it can loop. About two
minutes. ${NO_VOCALS}`,
  },
  {
    id: 'music_alert',
    title: 'Alarm / combat',
    model: MODELS.song,
    prompt: `Alarm and combat music for a 1940s-inspired tactical stealth game. D minor, 168 BPM. An urgent, driving
snare and timpani ostinato, aggressive staccato strings, brass stabs and rising horn figures; the feeling of being
hunted. Relentless energy with brief breathing points. About two minutes. ${NO_VOCALS}`,
  },
  {
    id: 'music_briefing',
    title: 'Briefing underscore (30 s clip)',
    model: MODELS.clip,
    prompt: `Mission briefing underscore for a 1940s-inspired tactical stealth game. D minor, 70 BPM. Subdued and
focused: solo piano, soft sustained strings, a faint radio-room atmosphere and a distant military snare. ${NO_VOCALS}`,
  },
  {
    id: 'music_victory',
    title: 'Mission success sting (30 s clip)',
    model: MODELS.clip,
    prompt: `Mission success music for a 1940s-inspired tactical stealth game. D major, 80 BPM. Bittersweet relief: warm
strings and a hopeful solo trumpet resolving a heroic theme, with gentle timpani. ${NO_VOCALS}`,
  },
];

// ---------------------------------------------------------------------------
// Dialogue
// ---------------------------------------------------------------------------

export const MISSION = `Operation "Silent Tide". Night, light rain and fog over Varrow Harbor.
Objective: disable the fire-control radio inside the cliff-top gun battery so a Coalition convoy can pass the
strait at dawn. Optional: recover the harbor master's codebook. Insertion: OTTER brings the team ashore by
inflatable boat beneath the north quay. Extraction: the north buoy, where OTTER's boat waits. Warnings: if the
battery raises the alarm, reinforcements from the harbor barracks will flood the cliff road; losing any operative
fails the operation.`;

export const SCENES = [
  {
    id: 'briefing',
    title: 'Mission briefing',
    speakers: ['LANTERN'],
    brief:
      '6 lines, all LANTERN. Lay out the situation, objective, optional objective, insertion, extraction and warnings; end with a memorable sign-off.',
  },
  {
    id: 'barks',
    title: 'Squad acknowledgements & callouts',
    speakers: SQUAD,
    brief:
      'Exactly 4 lines for EACH of MOTH, OWL, BADGER, FOX, HERON, OTTER (24 lines), grouped by speaker in that order. For each: (1) acknowledging a move order, (2) acknowledging an action order, (3) warning that a patrol is approaching, (4) reacting to a successful silent takedown or completed task. Each at most 9 words, strongly in character, no two lines alike.',
  },
  {
    id: 'guards',
    title: 'Enemy sentries on night watch',
    speakers: ['GUARD_A', 'GUARD_B'],
    brief:
      '8 lines alternating GUARD_A and GUARD_B on night watch at the harbor: grumbling about the cold and the rations, rumors of "shadows" taking sentries, GUARD_B hears a noise near the crates, GUARD_A reluctantly checks, and the final line is GUARD_A raising the alarm after finding an unconscious comrade.',
  },
  {
    id: 'radio_event',
    title: 'Dynamic radio event — new intel',
    speakers: ['LANTERN'],
    brief:
      '3 lines, all LANTERN: urgent new intelligence mid-mission. A captured Coalition scout is being held in the harbor master\'s office; rescuing them is optional but valuable.',
  },
  {
    id: 'banter',
    title: 'Squad banter while hiding',
    speakers: ['FOX', 'BADGER'],
    brief:
      '6 lines alternating FOX and BADGER, whispering while hidden behind fishing nets waiting for a patrol to pass. Light and characterful; reveals their personalities.',
  },
  {
    id: 'debrief',
    title: 'Mission debrief',
    speakers: ['LANTERN'],
    brief:
      '4 lines, all LANTERN, after a clean success: battery silenced, codebook recovered, nobody detected, convoy safe. Dry warmth; tease the next operation.',
  },
];

export const DIALOG_RULES = `Rules:
- Every line is original. No real-world nations, leaders, slogans or symbols.
- No foreign-language words and no imitated real-world accents for anyone; everyone speaks plain English.
- Mild language at most. No gore.
- "text" contains only the spoken words: no markdown, no quotation marks around the line, no stage directions.
- Put delivery directions in "style" (at most 80 characters).
- Barks are at most 9 words; every other line is at most 220 characters.`;

export function dialogPrompt() {
  const cast = Object.entries(CHARACTERS)
    .map(([id, c]) => `- ${id} — ${c.name}, ${c.role}. ${c.persona}`)
    .join('\n');
  const scenes = SCENES.map((s, i) => `${i + 1}. id "${s.id}" (${s.title}): ${s.brief}`).join('\n');
  return `You are the narrative writer for a video game.

WORLD
${WORLD}

CAST
${cast}

MISSION
${MISSION}

Write these six scenes, in this order:
${scenes}

${DIALOG_RULES}

Return JSON only, matching the provided schema.`;
}

// The Interactions API rejected this schema when it carried minItems/maxItems (HTTP 400),
// so array sizes are enforced by validateScript() after parsing instead.
export const DIALOG_SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: SCENES.map((s) => s.id) },
          title: { type: 'string' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                speaker: { type: 'string', enum: Object.keys(CHARACTERS) },
                style: { type: 'string', description: 'Delivery direction, at most 80 characters.' },
                text: { type: 'string', description: 'Spoken words only, at most 220 characters.' },
              },
              required: ['speaker', 'style', 'text'],
            },
          },
        },
        required: ['id', 'title', 'lines'],
      },
    },
  },
  required: ['scenes'],
};
