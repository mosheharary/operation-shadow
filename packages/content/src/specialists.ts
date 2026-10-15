import type { SpecialistId } from '@operation-shadow/engine';

/** Presentation for each specialist (approved in the pre-production samples). Rules live in the engine. */
export interface SpecialistProfile {
  id: SpecialistId;
  callSign: string;
  name: string;
  roleLabel: string;
  summary: string;
  bio: string;
  /** Portrait image under /media/portraits. */
  portrait: string;
  /** Gemini TTS voice used for the voice bank. */
  voice: string;
  /** Delivery direction given to the TTS model (approved in the samples). */
  voiceStyle: string;
  /** Accent colour for HUD markers. */
  color: string;
  strengths: string[];
  limits: string[];
}

export const SPECIALIST_PROFILES: Record<SpecialistId, SpecialistProfile> = {
  infiltrator: {
    id: 'infiltrator',
    callSign: 'MOTH',
    name: 'Sgt. Elias Varga',
    roleLabel: 'Infiltrator',
    summary: 'Silent takedowns, climbing and restraints.',
    bio: 'A former mountain guide who never raises his voice. Varga reaches places nobody else can and leaves sentries sleeping.',
    portrait: '/media/portraits/moth.jpg',
    voice: 'Enceladus',
    voiceStyle: 'quiet, low and controlled, close to a whisper',
    color: '#8f9bd8',
    strengths: ['Silent knockout or knife from behind', 'Climbs cliffs and walls at marked points', 'Carries bodies quickly', 'Remote noise lure'],
    limits: ['Cannot swim', 'No ranged weapon besides a loud pistol'],
  },
  recon: {
    id: 'recon',
    callSign: 'OWL',
    name: 'Lt. Hanna Brekke',
    roleLabel: 'Recon / Marksman',
    summary: 'Observation, tagging and long-range shots.',
    bio: 'A cartographer turned sharpshooter. Brekke counts every step and every sentry, and wastes no rounds.',
    portrait: '/media/portraits/owl.jpg',
    voice: 'Erinome',
    voiceStyle: 'crisp, precise and calm',
    color: '#7fbfae',
    strengths: ['Binoculars tag enemies at long range', 'Suppressed rifle (very few rounds)', 'Tranquilliser darts'],
    limits: ['Most fragile of the squad', 'Drags bodies slowly'],
  },
  engineer: {
    id: 'engineer',
    callSign: 'BADGER',
    name: "Cpl. Desmond 'Dez' Okafor",
    roleLabel: 'Combat Engineer',
    summary: 'Locks, wire, sabotage and demolition.',
    bio: 'A shipyard welder with a soft spot for machines. Okafor talks to locks until they open and to charges until they bloom.',
    portrait: '/media/portraits/badger.jpg',
    voice: 'Algenib',
    voiceStyle: 'warm, gruff and good-humored',
    color: '#d39a6a',
    strengths: ['Picks locks', 'Cuts wire fences', 'Quietly sabotages alarms, radios and lights', 'Demolition charges'],
    limits: ['Charges are loud and limited', 'No silent takedown'],
  },
  deception: {
    id: 'deception',
    callSign: 'FOX',
    name: 'Celeste Marchand',
    roleLabel: 'Deception Specialist',
    summary: 'Disguise, distraction and sedatives.',
    bio: 'A stage actress who never stopped performing. In an officer\'s coat, Marchand walks through checkpoints and talks sentries into looking the wrong way.',
    portrait: '/media/portraits/fox.jpg',
    voice: 'Despina',
    voiceStyle: 'smooth, playful and confident',
    color: '#d9829a',
    strengths: ['Wears an enemy officer\'s uniform', 'Holds a guard in conversation', 'Sedative syringe works face to face when disguised'],
    limits: ['Officers see through the disguise up close', 'Violence or carrying bodies blows her cover'],
  },
  medic: {
    id: 'medic',
    callSign: 'HERON',
    name: 'Dr. Ivo Lindqvist',
    roleLabel: 'Field Medic',
    summary: 'Revives, chloroform and smoke cover.',
    bio: 'A country doctor with steady hands and a wry bedside manner. Lindqvist keeps the squad breathing and the enemy sleeping.',
    portrait: '/media/portraits/heron.jpg',
    voice: 'Schedar',
    voiceStyle: 'calm, gentle and reassuring',
    color: '#88b4d8',
    strengths: ['Revives downed squad members', 'Chloroform takedown', 'Smoke canisters block sight'],
    limits: ['Limited medkits', 'Slow takedown'],
  },
  marine: {
    id: 'marine',
    callSign: 'OTTER',
    name: 'PO Kai Rennick',
    roleLabel: 'Marine Operator',
    summary: 'Swimming, diving and the harpoon.',
    bio: 'A fisherman\'s son who would rather be in cold water than on dry land. Rennick goes where the sea goes.',
    portrait: '/media/portraits/otter.jpg',
    voice: 'Zubenelgenubi',
    voiceStyle: 'relaxed, cocky and easy-going',
    color: '#6fb3c4',
    strengths: ['Swims and dives through deep water (hidden underwater)', 'Silent harpoon', 'Boards piers from the water by ladder'],
    limits: ['Harpoon has short range and slow reload'],
  },
};

export const HQ_PROFILE = {
  callSign: 'LANTERN',
  name: 'Colonel Ruth Ashdown',
  voice: 'Gacrux',
  voiceStyle: 'measured and authoritative, like a commander on a field radio',
} as const;

/** Enemy voices: "a" for rank-and-file sentries, "b" for sergeants and officers. */
export const GUARD_VOICES = {
  a: { voice: 'Charon', voiceStyle: 'tired, grumbling and low' },
  b: { voice: 'Fenrir', voiceStyle: 'sharp, clipped and commanding' },
} as const;
