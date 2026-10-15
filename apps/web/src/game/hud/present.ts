import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { SPECIALISTS } from '@operation-shadow/engine';

const ROLE_NAMES = new RegExp(`\\b(${SPECIALISTS.join('|')})\\b`, 'g');

/** Engine messages name roles ("engineer was killed"); the HUD shows call-signs instead. */
export function presentText(text: string): string {
  return text.replace(ROLE_NAMES, (role) => SPECIALIST_PROFILES[role as keyof typeof SPECIALIST_PROFILES].callSign);
}
