import type { AbilityId } from '@operation-shadow/engine';

/** Player-facing names and descriptions for abilities. Rules (range, items, timing) live in the engine. */
export interface AbilityInfo {
  name: string;
  description: string;
  /** Kills the target. The context action never picks a lethal ability on its own. */
  lethal?: boolean;
  /** Loud enough to be heard far away. */
  loud?: boolean;
}

export const ABILITY_INFO: Record<AbilityId, AbilityInfo> = {
  takedown: { name: 'Knockout', description: 'Silently knock out a soldier from behind. He stays down for a while unless tied up.' },
  knife: { name: 'Knife', description: 'A silent, lethal strike from behind.', lethal: true },
  restrain: { name: 'Tie up', description: 'Bind an unconscious soldier so he cannot wake and raise the alarm. Uses rope.' },
  carry: { name: 'Carry body', description: 'Lift a body to move it out of sight.' },
  drop: { name: 'Put down', description: 'Put down the body you are carrying.' },
  'hide-body': { name: 'Hide body', description: 'Stash a carried body in a crate, shed or thick bush.' },
  door: { name: 'Door', description: 'Open or close a door.' },
  lockpick: { name: 'Pick lock', description: 'Quietly open a locked door.' },
  'cut-fence': { name: 'Cut wire', description: 'Cut a gap in a wire fence.' },
  sabotage: { name: 'Sabotage', description: 'Quietly disable an alarm bell, radio, searchlight or target.' },
  'place-charge': { name: 'Demolition charge', description: 'Plant a timed charge. Destroys targets, very loud.', loud: true },
  'pick-up': { name: 'Pick up', description: 'Take an item or recover your device.' },
  'throw-stone': { name: 'Throw stone', description: 'Make a noise to lure a guard to a spot.' },
  'place-device': { name: 'Noise lure', description: 'Place a remote noise device at your feet.' },
  'trigger-device': { name: 'Trigger lure', description: 'Set off your noise device from anywhere.' },
  binoculars: { name: 'Binoculars', description: 'Study and tag a soldier at long range.' },
  rifle: { name: 'Suppressed rifle', description: 'A quiet long-range shot. Very few rounds.', lethal: true },
  dart: { name: 'Tranquilliser dart', description: 'Knock out a soldier at range.' },
  disguise: { name: 'Put on uniform', description: 'Change into a captured officer uniform, out of sight.' },
  'take-uniform': { name: 'Take uniform', description: 'Take the uniform of an unconscious or dead officer.' },
  converse: { name: 'Distract', description: 'While disguised, hold a soldier in conversation. He watches only you.' },
  chat: { name: 'Chat', description: 'Strike up a conversation. For 10 seconds the soldier stops looking around and watches only the spy.' },
  sedative: { name: 'Sedative', description: 'Knock out a soldier up close. Works face to face on a relaxed soldier while disguised.' },
  revive: { name: 'Revive', description: 'Bring a downed squad member back with a medkit.' },
  'first-aid': { name: 'First aid', description: 'Slowly patch up a downed squad member with a field dressing.' },
  resupply: { name: 'Resupply', description: 'Hand a squad member pistol rounds, rifle rounds or harpoon bolts they can fire. Everyone armed carries 2 spare rifle rounds and 2 harpoon bolts for the team.' },
  chloroform: { name: 'Chloroform', description: 'Knock out a soldier from behind. Slower but quieter than a blow.' },
  smoke: { name: 'Smoke canister', description: 'A cloud that blocks sight for 20 seconds.' },
  pistol: { name: 'Pistol', description: 'A loud sidearm. Every soldier nearby will hear it.', lethal: true, loud: true },
  harpoon: { name: 'Harpoon', description: 'A silent, lethal bolt at short range. Slow to reload.', lethal: true },
  dive: { name: 'Dive / surface', description: 'Slip under the water to stay hidden, or come up for air.' },
  free: { name: 'Free', description: 'Free a prisoner or a captured squad member.' },
};
