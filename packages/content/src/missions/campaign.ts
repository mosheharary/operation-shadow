import { ALPINE_TEMPLATE, compileMission, impliedRoles, MISSION_SPEC_VERSION, type MissionSpec, RAIL_TEMPLATE, type TemplateDef, TRAINING_TEMPLATE } from '@operation-shadow/engine';
import type { Briefing, MissionEntry } from './types';

/** Wraps a spec as a playable mission entry; the squad rules include what the objectives imply. */
export function specMission(
  template: TemplateDef,
  spec: MissionSpec,
  meta: { summary: string; briefing: Briefing; debrief: MissionEntry['debrief']; tutorial?: boolean },
): MissionEntry {
  const required = [...new Set([...spec.squad.required, ...impliedRoles(spec.objectives)])];
  return {
    key: spec.id,
    title: spec.title,
    theme: template.theme,
    summary: meta.summary,
    squad: { required, min: Math.max(spec.squad.min, required.length), max: spec.squad.max },
    briefing: meta.briefing,
    debrief: meta.debrief,
    build: () => compileMission(spec, template),
    spec,
    ...(meta.tutorial ? { tutorial: true } : {}),
  };
}

const spec = (s: Omit<MissionSpec, 'version'>): MissionSpec => ({ version: MISSION_SPEC_VERSION, ...s });

export const BOOT_CAMP = specMission(
  TRAINING_TEMPLATE,
  spec({
    id: 'boot-camp',
    title: 'Boot Camp',
    templateId: TRAINING_TEMPLATE.id,
    seed: 101,
    env: { timeOfDay: 21, weather: 'clear' },
    density: 'light',
    objectives: [
      {
        id: 'papers',
        kind: 'steal',
        slot: 'armory-papers',
        title: 'Recover the training papers',
        description: 'They are locked in the armory. BADGER can pick the lock.',
        required: true,
      },
    ],
    squad: { required: ['infiltrator', 'engineer'], min: 2, max: 2 },
    failAtAlarm: null,
    parSeconds: 600,
    events: [],
  }),
  {
    summary: 'A guided night exercise: learn to move, hide, take down a sentry and slip out unseen.',
    tutorial: true,
    briefing: {
      codename: 'Exercise Boot Camp',
      location: 'Shadow Section training camp',
      time: '21:00',
      weather: 'Clear, dusk',
      premise: [
        'Before Lantern sends you behind the lines, you prove yourself on the training ground. Three instructors play sentries tonight.',
        'MOTH and BADGER will take you through every skill you need, one step at a time.',
      ],
      intel: [
        'A sentry watches the grass field from the north. Stay low in the tall grass.',
        'A second sentry stands in the drill yard with his back to the field.',
        'The training papers are locked in the armory. The gate is guarded, but the fence can be cut.',
      ],
      warnings: ['Nothing here can go badly wrong: if you are spotted, simply try again.'],
      insertion: 'The west end of the camp track.',
      extraction: 'The pick-up point beyond the east fence.',
      dossierImage: '/media/briefing/boot-camp.jpg',
      recommended: ['infiltrator', 'engineer'],
    },
    debrief: { success: 'Lantern signs your papers. You are ready for the field.', failure: 'Not quite. Take a breath and try again.' },
  },
);

export const WHITE_SILENCE = specMission(
  ALPINE_TEMPLATE,
  spec({
    id: 'white-silence',
    title: 'White Silence',
    templateId: ALPINE_TEMPLATE.id,
    seed: 4711,
    env: { timeOfDay: 13, weather: 'snow' },
    density: 'standard',
    objectives: [
      { id: 'radar', kind: 'sabotage', slot: 'radar-console', title: 'Blind the Whitecrown radar', description: 'Sabotage the radar console in the station bunker on the plateau.', required: true },
      { id: 'charts', kind: 'steal', slot: 'chalet-desk', title: 'Take the frequency charts', description: "The commandant keeps them in his chalet in the hamlet.", required: false },
    ],
    squad: { required: [], min: 3, max: 4 },
    failAtAlarm: null,
    parSeconds: 1000,
    events: [
      { id: 'landing', trigger: { type: 'time', seconds: 4 }, action: { type: 'message', text: 'Lantern to Shadow Section. Fresh snow keeps every footprint. The radar sits on the plateau beyond the gorge.' } },
      { id: 'radar-done', trigger: { type: 'objective', objectiveId: 'radar' }, action: { type: 'message', text: 'The radar is blind. Our bombers are already in the air. Get back to the drop zone.' } },
      { id: 'alarm', trigger: { type: 'alarm', level: 3 }, action: { type: 'reinforce', sector: 'station', count: 3 } },
    ],
  }),
  {
    summary: 'Daylight in deep snow. Cross the gorge and blind the radar on Whitecrown Ridge.',
    briefing: {
      codename: 'Operation White Silence',
      location: 'Whitecrown Ridge, Northern Reach',
      time: '13:00',
      weather: 'Light snow',
      premise: [
        'The radar on Whitecrown Ridge sees every Coalition aircraft long before it reaches the coast. Tonight’s bombers need it blind.',
        'You go in by daylight while the garrison expects nothing. The snow hides you from a distance and betrays you up close.',
      ],
      intel: [
        'The radar console sits in a concrete hut inside the fenced station on the plateau.',
        'Two crossings span the gorge: the guarded road bridge and a fallen log further south. OTTER can swim the river.',
        'MOTH can climb the plateau cliff. Everyone else must use the switchback road.',
        'Footprints in fresh snow will be noticed and followed.',
      ],
      warnings: ['An alarm brings reinforcements from the station quarters. The mission does not fail on an alarm.', 'Losing any operative fails the operation.'],
      insertion: 'A drop zone in the western woods.',
      extraction: 'Back to the drop zone.',
      dossierImage: '/media/briefing/white-silence.jpg',
      recommended: ['engineer', 'infiltrator', 'recon', 'marine'],
    },
    debrief: { success: 'The radar went quiet and the bombers came home untouched.', failure: 'Whitecrown still watches the sky. Lantern recalls the section.' },
  },
);

export const IRON_JUNCTION = specMission(
  RAIL_TEMPLATE,
  spec({
    id: 'iron-junction',
    title: 'Iron Junction',
    templateId: RAIL_TEMPLATE.id,
    seed: 8128,
    env: { timeOfDay: 20, weather: 'fog' },
    density: 'standard',
    objectives: [
      { id: 'train', kind: 'sabotage', slot: 'ammo-train', title: 'Sabotage the ammunition train', description: 'Wreck the brake lines of the ammunition train before it leaves the yard.', required: true },
      { id: 'timetable', kind: 'steal', slot: 'station-office', title: "Steal the stationmaster's timetable", description: 'It lists every Dominion supply train for the month.', required: false },
      { id: 'driver', kind: 'rescue', slot: 'lockup-cell', title: 'Free the captured driver', description: 'A Coalition engine driver is held in the yard lock-up.', required: false, revealAtSeconds: 120 },
    ],
    squad: { required: [], min: 3, max: 4 },
    failAtAlarm: null,
    parSeconds: 1000,
    events: [
      { id: 'landing', trigger: { type: 'time', seconds: 4 }, action: { type: 'message', text: 'Lantern to Shadow Section. The fog is on our side tonight. The ammunition train stands on the third track.' } },
      { id: 'driver', trigger: { type: 'time', seconds: 121 }, action: { type: 'message', text: 'New information. One of our engine drivers is held in the yard lock-up. Bring him out if you can.' } },
      { id: 'train-done', trigger: { type: 'objective', objectiveId: 'train' }, action: { type: 'message', text: 'That train is going nowhere. Back to the woods.' } },
      { id: 'alarm', trigger: { type: 'alarm', level: 3 }, action: { type: 'reinforce', sector: 'yard', count: 3 } },
    ],
  }),
  {
    summary: 'Foggy dusk at Corvan Junction. Stop the ammunition train before it rolls.',
    briefing: {
      codename: 'Operation Iron Junction',
      location: 'Corvan Junction, Northern Reach',
      time: '20:00',
      weather: 'Thick fog',
      premise: [
        'An ammunition train bound for the Varrow front waits in the Corvan marshalling yard. It must never leave.',
        'Fog has rolled in from the river. Sentries will see a few dozen metres at most.',
      ],
      intel: [
        'The ammunition train stands on the third track, guarded at both ends.',
        'Rows of empty wagons divide the yard into corridors. Patrols walk between them.',
        'The perimeter fence has a gap near the woods and a guarded level crossing.',
        'A searchlight on the yard tower sweeps the tracks.',
      ],
      warnings: ['An alarm brings guards from the guardhouse and the sheds. The mission does not fail on an alarm.', 'Losing any operative fails the operation.'],
      insertion: 'The woods south of the yard.',
      extraction: 'Back to the woods.',
      dossierImage: '/media/briefing/iron-junction.jpg',
      recommended: ['engineer', 'infiltrator', 'deception', 'medic'],
    },
    debrief: { success: 'The train never left Corvan. The front goes short of shells this month.', failure: 'The ammunition train rolled out on schedule.' },
  },
);
