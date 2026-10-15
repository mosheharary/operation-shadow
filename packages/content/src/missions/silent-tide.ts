import { COASTAL_TEMPLATE_ID, generateCoastal, type GuardSpawn, type LevelData, type MissionRuntime, type ObjectSpawn, type SpecialistId } from '@operation-shadow/engine';
import type { MissionEntry } from './types';

export const SILENT_TIDE_SEED = 20261015;
const SQUAD = { required: ['engineer'] as SpecialistId[], min: 3, max: 4 };

function slot(level: LevelData, id: string) {
  const found = level.slots.find((s) => s.id === id);
  if (!found) throw new Error(`Silent Tide: level is missing ${id}`);
  return found;
}

const guard = (id: string, sector: string, where: { postId: string } | { routeId: string; routeStart?: number }, extra: Partial<GuardSpawn> = {}): GuardSpawn => ({
  id,
  archetype: 'rifleman',
  rank: 'soldier',
  temperament: 'standard',
  sector,
  ...where,
  ...extra,
});

export function buildSilentTide(): { level: LevelData; mission: MissionRuntime } {
  const level = generateCoastal({ seed: SILENT_TIDE_SEED, id: 'silent-tide' });

  const objects: ObjectSpawn[] = [
    ...level.fixtures.map((f) => ({ ...f })),
    { type: 'objective-target', id: 'target:fire-control-radio', pos: slot(level, 'slot:bunker-console').pos, label: 'Fire-control radio', sector: 'battery' },
    { type: 'item', id: 'item:codebook', pos: slot(level, 'slot:office-desk').pos, item: 'codebook', amount: 1 },
    { type: 'prisoner', id: 'prisoner:scout', pos: slot(level, 'slot:holding-cell').pos },
  ];

  const guards: GuardSpawn[] = [
    guard('g:beach', 'beach', { routeId: 'route:beach' }, { lantern: true }),
    guard('g:street-1', 'village', { routeId: 'route:street' }),
    guard('g:street-2', 'village', { routeId: 'route:street', routeStart: 2 }, { lantern: true }),
    guard('g:office-officer', 'village', { postId: 'post:office-inside' }, { rank: 'officer', temperament: 'strict' }),
    guard('g:office-door', 'village', { postId: 'post:office-door' }),
    guard('g:holding-door', 'village', { postId: 'post:holding-door' }, { temperament: 'passive' }),
    guard('g:junction', 'village', { postId: 'post:junction' }),
    guard('g:quay', 'harbor', { routeId: 'route:quay' }, { lantern: true }),
    guard('g:pier', 'harbor', { postId: 'post:pier-a-end' }, { temperament: 'passive' }),
    guard('g:warehouse', 'harbor', { postId: 'post:warehouse-door' }),
    guard('g:quay-east', 'harbor', { postId: 'post:quay-east' }, { lantern: true }),
    guard('g:ramp', 'battery', { routeId: 'route:ramp' }),
    guard('g:gate-north', 'battery', { postId: 'post:gate-north' }, { temperament: 'strict' }),
    guard('g:gate-south', 'battery', { postId: 'post:gate-south' }),
    guard('g:tower-nw', 'battery', { postId: 'post:tower-nw' }),
    guard('g:tower-se', 'battery', { postId: 'post:tower-se' }),
    guard('g:compound-north', 'battery', { routeId: 'route:compound-north' }),
    guard('g:battery-officer', 'battery', { routeId: 'route:compound-south' }, { rank: 'officer', temperament: 'strict' }),
    guard('g:bunker-door', 'battery', { postId: 'post:bunker-door' }, { temperament: 'strict' }),
    guard('g:radio-operator', 'battery', { postId: 'post:bunker-radio' }, { temperament: 'passive', radio: true }),
    guard('g:gun-crew', 'battery', { postId: 'post:gun-1' }),
    guard('g:barracks-door', 'battery', { postId: 'post:barracks-door' }),
    guard('g:forest', 'south', { routeId: 'route:forest-edge' }, { lantern: true }),
  ];

  const mission: MissionRuntime = {
    id: 'silent-tide',
    title: 'Silent Tide',
    templateId: COASTAL_TEMPLATE_ID,
    env: { timeOfDay: 23.5, weather: 'rain' },
    squadSpawns: level.slots.filter((s) => s.tags.includes('insertion')).map((s) => ({ pos: s.pos, facing: s.facing })),
    requiredRoles: [...SQUAD.required],
    squadSize: { min: SQUAD.min, max: SQUAD.max },
    guards,
    objects,
    objectives: [
      {
        id: 'obj:radio',
        kind: 'disable-target',
        targetId: 'target:fire-control-radio',
        required: true,
        title: 'Disable the fire-control radio',
        description: 'Sabotage or destroy the fire-control radio inside the cliff-top bunker so the convoy can pass at dawn.',
      },
      {
        id: 'obj:codebook',
        kind: 'acquire-item',
        itemObjectId: 'item:codebook',
        required: false,
        title: "Recover the harbor master's codebook",
        description: "It is kept in the harbor master's office on the quay.",
      },
      {
        id: 'obj:scout',
        kind: 'rescue',
        prisonerId: 'prisoner:scout',
        required: false,
        hidden: true,
        title: 'Free the captured scout',
        description: 'A Coalition scout is held in the village lock-up. Bring him back to the boat.',
      },
    ],
    extractionZoneId: 'extraction',
    holdingZoneId: 'holding',
    director: [
      {
        id: 'dir:landing',
        trigger: { type: 'time', seconds: 4 },
        actions: [{ type: 'message', speaker: 'LANTERN', lineKey: 'silent-tide-landing', text: "Lantern to Shadow Section. You're ashore. The battery sits on the cliff to the east. Keep to the shadows." }],
      },
      {
        id: 'dir:scout',
        trigger: { type: 'time', seconds: 150 },
        actions: [
          { type: 'reveal-objective', objectiveId: 'obj:scout' },
          {
            type: 'message',
            speaker: 'LANTERN',
            lineKey: 'silent-tide-scout',
            text: 'New intelligence. A captured Coalition scout is held in the village lock-up. The battery is still your priority, but bringing him home would save an entire network.',
          },
        ],
      },
      {
        id: 'dir:radio-done',
        trigger: { type: 'objective', objectiveId: 'obj:radio' },
        actions: [{ type: 'message', speaker: 'LANTERN', lineKey: 'silent-tide-radio-done', text: 'The battery is blind. Get back to the boat.' }],
      },
      {
        id: 'dir:alarm',
        trigger: { type: 'alarm', level: 3 },
        actions: [{ type: 'message', speaker: 'LANTERN', lineKey: 'silent-tide-alarm', text: 'They know you are there. Expect reinforcements on the cliff road.' }],
      },
    ],
    failAtAlarm: null,
    parSeconds: 900,
    reinforcementSpawns: [
      { sector: 'battery', pos: { x: 130, z: 41.6 }, count: 4 },
      { sector: 'village', pos: { x: 60.5, z: 39 }, count: 2 },
    ],
  };
  return { level, mission };
}

export const SILENT_TIDE: MissionEntry = {
  key: 'silent-tide',
  title: 'Silent Tide',
  theme: 'coastal',
  summary: 'Night insertion at Varrow Harbor. Blind the cliff-top battery before the convoy sails at dawn.',
  squad: SQUAD,
  briefing: {
    codename: 'Operation Silent Tide',
    location: 'Varrow Harbor, Northern Reach',
    time: '23:30',
    weather: 'Light rain, sea mist',
    premise: [
      'A Coalition convoy must pass the Varrow strait at dawn. The Iron Dominion gun battery on the cliff above the harbor will tear it apart unless its fire-control radio goes dark.',
      'Shadow Section lands on the western beach by boat. Get in, silence the battery, and get out before first light.',
    ],
    intel: [
      'The fire-control radio is inside the concrete bunker in the fenced battery compound.',
      'The compound gate on the cliff road is guarded. The wire fence can be cut, and the cliff can be climbed from the quay and from the forest.',
      "The harbor master keeps the coastal codebook in his office on the quay. An officer works late there.",
      'Lanterns, lamps and the tower searchlight light parts of the area. Darkness and rain are your allies.',
    ],
    warnings: [
      'If the alarm is raised, reinforcements leave the barracks and the cliff road. The mission does not fail on an alarm, but it becomes far harder.',
      'Losing any operative fails the operation.',
      'Only the Combat Engineer can sabotage the radio or set charges. The Engineer is required.',
    ],
    insertion: 'Western beach, by boat.',
    extraction: 'Return to the boat on the western beach.',
    dossierImage: '/media/briefing/silent-tide.jpg',
    recommended: ['engineer', 'infiltrator', 'recon', 'marine'],
  },
  debrief: {
    success: 'The convoy cleared the strait at dawn without a shot from the cliffs.',
    failure: 'The operation failed. Lantern is pulling Shadow Section back to regroup.',
  },
  build: buildSilentTide,
};
