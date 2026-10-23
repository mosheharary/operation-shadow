import type { Guard, SpecialistId } from '@operation-shadow/engine';
import type { FigureLook } from './figure';

/** The squad as drawn in the approved line-up (samples/images/squad_lineup.jpg). */
export const SQUAD_LOOKS: Record<SpecialistId, FigureLook> = {
  // MOTH: black roll-neck sweater, knit cap, camouflage face paint, climbing rope, knife on the thigh.
  infiltrator: {
    outfit: 'sweater',
    coat: '#2c2e31',
    trousers: '#34342f',
    skin: '#8a6a52',
    hair: '#231d18',
    hairStyle: 'cropped',
    headgear: 'beanie',
    headgearColor: '#202227',
    boots: 'ankle',
    bootColor: '#3f4134',
    gear: ['rope', 'knife', 'face-paint', 'small-pack', 'stubble'],
    packColor: '#3a3a33',
    weapon: 'none',
    height: 1.02,
  },
  // OWL: olive field jacket and cap, binoculars, map case, scoped rifle.
  recon: {
    outfit: 'field-jacket',
    coat: '#56603a',
    trousers: '#4c5432',
    skin: '#d4ab8c',
    hair: '#5a3a26',
    hairStyle: 'bob',
    headgear: 'field-cap',
    headgearColor: '#55603a',
    boots: 'ankle',
    bootColor: '#4a3524',
    gear: ['binoculars', 'satchel', 'belt-pouches'],
    weapon: 'scoped-rifle',
    build: 0.9,
    height: 0.96,
  },
  // BADGER: grey work shirt with rolled sleeves, suspenders, steel helmet, heavy pack with bedroll and tools.
  engineer: {
    outfit: 'work-shirt',
    coat: '#6b737c',
    trousers: '#3b4148',
    skin: '#9a6e52',
    hair: '#2e2620',
    hairStyle: 'cropped',
    headgear: 'steel-helmet',
    headgearColor: '#575c52',
    boots: 'ankle',
    bootColor: '#3e2e20',
    gear: ['suspenders', 'large-pack', 'bedroll', 'tools', 'belt-pouches', 'stubble'],
    packColor: '#5f5a3e',
    weapon: 'none',
    build: 1.1,
    height: 1.03,
  },
  // FOX: belted trench coat, beret with badge, leather satchel.
  deception: {
    outfit: 'trench-coat',
    coat: '#8f8064',
    trousers: '#8a7464',
    skin: '#e0b89c',
    hair: '#4a2a1c',
    hairStyle: 'bob',
    headgear: 'beret',
    headgearColor: '#262a33',
    boots: 'heels',
    gear: ['satchel'],
    weapon: 'none',
    build: 0.88,
    height: 0.97,
  },
  // HERON: worn tunic, round glasses, green-cross armband, medical bag and bedroll.
  medic: {
    outfit: 'tunic',
    coat: '#55533f',
    trousers: '#4b4a3b',
    skin: '#d2ad90',
    hair: '#7c7468',
    hairStyle: 'receding',
    headgear: 'bare',
    headgearColor: '#4b4b3a',
    boots: 'ankle',
    bootColor: '#4a3524',
    gear: ['armband', 'medic-bag', 'glasses', 'bedroll', 'small-pack'],
    packColor: '#6b6448',
    weapon: 'none',
    build: 0.92,
    height: 1.04,
  },
  // OTTER: black wetsuit and hood, gloves, inflatable dinghy and fins on the back, speargun.
  marine: {
    outfit: 'wetsuit',
    coat: '#2c343c',
    trousers: '#2c343c',
    skin: '#c99c7a',
    hair: '#3a2a1e',
    hairStyle: 'short',
    headgear: 'hood',
    headgearColor: '#1b1f24',
    boots: 'wetsuit',
    gear: ['dinghy', 'fins', 'gloves', 'belt-pouches'],
    weapon: 'harpoon',
    height: 1.01,
  },
  // MAGPIE: a local clock-mender in a charcoal overcoat, bare-headed with glasses and a moustache. Unarmed.
  spy: {
    outfit: 'trench-coat',
    coat: '#3d3a3e',
    trousers: '#2f2c2b',
    skin: '#cfa384',
    hair: '#3b2c22',
    hairStyle: 'short',
    headgear: 'bare',
    headgearColor: '#3d3a3e',
    boots: 'ankle',
    bootColor: '#2a211b',
    gear: ['glasses', 'mustache', 'satchel'],
    weapon: 'none',
    build: 0.95,
    height: 1.0,
  },
};

/** FOX in a stolen Iron Dominion officer's coat and kepi. */
export const DISGUISED_LOOK: FigureLook = {
  outfit: 'officer-coat',
  coat: '#4a5d75',
  trousers: '#2f3a48',
  skin: '#e0b89c',
  hair: '#4a2a1c',
  hairStyle: 'bob',
  headgear: 'kepi',
  headgearColor: '#3f4f63',
  accent: '#8a3b2a',
  boots: 'tall',
  gear: ['cape'],
  weapon: 'none',
  build: 0.88,
  height: 0.97,
};

export const PRISONER_LOOK: FigureLook = {
  outfit: 'shirt',
  coat: '#7a7056',
  trousers: '#4e4a3a',
  skin: '#c9a084',
  hair: '#3b3026',
  hairStyle: 'short',
  headgear: 'bare',
  headgearColor: '#6b6346',
  boots: 'ankle',
  gear: ['stubble'],
  weapon: 'none',
  height: 0.99,
};

const SKINS = ['#c9a184', '#b98f70', '#d8b293', '#a77a5c', '#c39a7e', '#8f6649'];
const HAIRS = ['#2d241d', '#4a3526', '#6b5238', '#1f1b18', '#7d6c58'];

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Iron Dominion uniforms (approved design sheet, samples/images/enemy_uniforms.jpg): slate-blue
 * greatcoats with rust collar tabs and brass buttons, ridged helmets, puttees; NCOs add leather
 * cross-straps; officers wear the long coat with a cape, kepi and tall boots. Each soldier gets
 * his own face, colouring and height from his id.
 */
export function guardLook(guard: Pick<Guard, 'id' | 'rank' | 'carriesLantern'>): FigureLook {
  const h = hashId(guard.id);
  const skin = SKINS[h % SKINS.length]!;
  const hair = HAIRS[(h >>> 4) % HAIRS.length]!;
  const height = 0.96 + ((h >>> 8) % 9) * 0.01;
  const face: FigureLook['gear'] = (h >>> 12) % 3 === 0 ? ['mustache'] : (h >>> 12) % 3 === 1 ? ['stubble'] : [];
  if (guard.rank === 'officer') {
    return {
      outfit: 'officer-coat',
      coat: '#46586e',
      trousers: '#2f3a48',
      skin,
      hair,
      hairStyle: 'short',
      headgear: 'kepi',
      headgearColor: '#3f4f63',
      accent: '#8a3b2a',
      boots: 'tall',
      gear: ['cape', ...face],
      weapon: 'none',
      lantern: guard.carriesLantern,
      height: height + 0.01,
    };
  }
  return {
    outfit: 'greatcoat',
    coat: guard.rank === 'nco' ? '#4d607a' : '#4b5d73',
    trousers: '#5a5e52',
    skin,
    hair,
    hairStyle: 'cropped',
    headgear: 'ridged-helmet',
    headgearColor: '#6a737b',
    accent: '#8a3b2a',
    boots: 'puttees',
    bootColor: '#3a2e24',
    gear: guard.rank === 'nco' ? ['cross-straps', 'belt-pouches', ...face] : ['belt-pouches', ...face],
    weapon: 'rifle',
    lantern: guard.carriesLantern,
    build: guard.rank === 'nco' ? 1.04 : 1 + ((h >>> 16) % 5) * 0.02,
    height,
  };
}
