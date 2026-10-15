import type { Guard, SpecialistId } from '@operation-shadow/engine';
import type { FigureLook } from './figure';

/** Approved squad silhouettes (see samples/images/squad_lineup.jpg). */
export const SQUAD_LOOKS: Record<SpecialistId, FigureLook> = {
  infiltrator: { coat: '#2f3134', trousers: '#36362f', skin: '#7d634f', headgear: 'beanie', headgearColor: '#232529', rope: true, pack: 'small', packColor: '#3a3a33', weapon: 'none' },
  recon: { coat: '#535d34', trousers: '#4a5130', skin: '#c49a7c', headgear: 'field-cap', headgearColor: '#535d34', weapon: 'long-rifle', pack: 'satchel', packColor: '#6a4a2e' },
  engineer: { coat: '#5e6670', trousers: '#3e434a', skin: '#6e4b37', headgear: 'steel-helmet', headgearColor: '#4f5448', pack: 'large', packColor: '#5a5338', weapon: 'none' },
  deception: { coat: '#8c7c5a', trousers: '#3b3530', skin: '#d2a98c', headgear: 'beret', headgearColor: '#1e1f24', longCoat: true, pack: 'satchel', packColor: '#6a4a2e', weapon: 'none' },
  medic: { coat: '#4b4b3a', trousers: '#44443a', skin: '#c8a286', headgear: 'bare', headgearColor: '#4b4b3a', armband: true, pack: 'satchel', packColor: '#6b5a3c', weapon: 'none' },
  marine: { coat: '#22272d', trousers: '#22272d', skin: '#b8906f', headgear: 'hood', headgearColor: '#22272d', pack: 'dinghy', packColor: '#4b5a3c', weapon: 'harpoon' },
};

/** Fox in a stolen Iron Dominion officer's coat. */
export const DISGUISED_LOOK: FigureLook = {
  coat: '#4a5d75',
  trousers: '#2f3a48',
  skin: '#d2a98c',
  headgear: 'kepi',
  headgearColor: '#3f4f63',
  longCoat: true,
  accent: '#8a3b2a',
  weapon: 'none',
};

export const PRISONER_LOOK: FigureLook = { coat: '#6b6346', trousers: '#4a4636', skin: '#c49a7c', headgear: 'bare', headgearColor: '#6b6346', weapon: 'none' };

/** Iron Dominion uniforms (revised, approved design): slate-blue coats, rust tabs, ridged helmets. */
export function guardLook(guard: Pick<Guard, 'rank' | 'carriesLantern'>): FigureLook {
  if (guard.rank === 'officer') {
    return { coat: '#46586e', trousers: '#2f3a48', skin: '#c9a184', headgear: 'kepi', headgearColor: '#3f4f63', longCoat: true, accent: '#8a3b2a', weapon: 'none', lantern: guard.carriesLantern };
  }
  return {
    coat: '#4b5d73',
    trousers: '#3d4a5a',
    skin: '#c39a7e',
    headgear: 'ridged-helmet',
    headgearColor: '#5b6670',
    longCoat: true,
    accent: '#8a3b2a',
    weapon: 'rifle',
    lantern: guard.carriesLantern,
  };
}
