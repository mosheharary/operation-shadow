import type { BarkLine, SpecialistId } from '@operation-shadow/engine';

/**
 * Voice/subtitle bank. Squad lines marked [approved] come from the approved sample script; the
 * others are written in the same voices so callouts can vary. Every line has a stable key, used
 * as the voice-file name by the build-time media pipeline.
 */
export interface DialogueLine {
  key: string;
  text: string;
}

type SquadBarkKey = Extract<BarkLine, 'ack-move' | 'ack-action' | 'warn-patrol' | 'success' | 'downed'>;
type GuardBarkKey = Exclude<BarkLine, SquadBarkKey>;

const lines = (prefix: string, texts: string[]): DialogueLine[] => texts.map((text, i) => ({ key: `${prefix}-${i + 1}`, text }));

export const SQUAD_BARKS: Record<SpecialistId, Record<SquadBarkKey, DialogueLine[]>> = {
  infiltrator: {
    'ack-move': lines('moth-ack-move', ['Shifting into the fog now.' /* approved */, 'Moving.', 'Quietly does it.']),
    'ack-action': lines('moth-ack-action', ['Securing the anchor point.' /* approved */, 'Consider it done.', 'On it.']),
    'warn-patrol': lines('moth-warn', ['Sentry pacing this way. Stay low.' /* approved */, 'Company. Keep still.']),
    success: lines('moth-success', ['Target sleeping. Path is clear.' /* approved */, 'He will wake with a headache.']),
    downed: lines('moth-downed', ['I am hit. Quietly, please.']),
  },
  recon: {
    'ack-move': lines('owl-ack-move', ['Repositioning to bearing zero-four-zero.' /* approved */, 'Moving to new position.', 'Relocating. Thirty metres.']),
    'ack-action': lines('owl-ack-action', ['Tagging target on the overlook now.' /* approved */, 'Target acquired.', 'Copy. Executing.']),
    'warn-patrol': lines('owl-warn', ['Sentry closing from west, twenty paces.' /* approved */, 'Two hostiles. Bearing one-eight-zero.']),
    success: lines('owl-success', ['Dart struck home. Sentry is down.' /* approved */, 'Clean. Next.']),
    downed: lines('owl-downed', ['I am hit. Need a medic.']),
  },
  engineer: {
    'ack-move': lines('badger-ack-move', ['Moving my boots, nice and quiet.' /* approved */, 'Right behind you.', 'On my way.']),
    'ack-action': lines('badger-ack-action', ['Let Uncle Dez coax this lock open.' /* approved */, 'Leave it to me.', 'Tools out.']),
    'warn-patrol': lines('badger-warn', ['Heavy steps coming. Duck your heads.' /* approved */, 'Somebody is coming, mind yourselves.']),
    success: lines('badger-success', ['Beautiful girl, purring like a kitten now.' /* approved */, 'Done. Sweet as you like.']),
    downed: lines('badger-downed', ['Ah. That one got me.']),
  },
  deception: {
    'ack-move': lines('fox-ack-move', ['Stepping onto my mark, darling.' /* approved */, 'Exit, stage left.', 'Moving, darling.']),
    'ack-action': lines('fox-ack-action', ['Time for a little harmless misdirection.' /* approved */, 'Leave him to me.', 'Watch and learn.']),
    'warn-patrol': lines('fox-warn', ['Our audience approaches. Curtain down, everyone.' /* approved */, 'Visitors. Look natural.']),
    success: lines('fox-success', ['And the gentleman takes his final bow.' /* approved */, 'Applause can wait.']),
    downed: lines('fox-downed', ['Not my best performance.']),
  },
  medic: {
    'ack-move': lines('heron-ack-move', ['Moving up. Keep breathing, friends.' /* approved */, 'Coming.', 'On my way.']),
    'ack-action': lines('heron-ack-action', ['Administering a gentle dose right now.' /* approved */, 'Hold still.', 'Steady hands.']),
    'warn-patrol': lines('heron-warn', ['Footsteps approaching. Do not make a sound.' /* approved */, 'Someone is coming. Quiet now.']),
    success: lines('heron-success', ['Patient is resting comfortably. No complications.' /* approved */, 'Sleeping like a child.']),
    downed: lines('heron-downed', ['I am down. Physician, heal thyself.']),
  },
  marine: {
    'ack-move': lines('otter-ack-move', ['Swimming with the tide. On my way.' /* approved */, 'Aye, moving.', 'Easy does it.']),
    'ack-action': lines('otter-ack-action', ['Rigging the line fast and true.' /* approved */, 'Aye aye.', 'Leave it with me.']),
    'warn-patrol': lines('otter-warn', ['Greycoats drifting our way, fast current.' /* approved */, 'Patrol off the bow. Heads down.']),
    success: lines('otter-success', ['Clipped his fins. Sentry is out cold.' /* approved */, 'Back in the water he goes. Figuratively.']),
    downed: lines('otter-downed', ['Taking on water here.']),
  },
};

export const GUARD_BARKS: Record<GuardBarkKey, DialogueLine[]> = {
  'guard-suspicious': lines('guard-suspicious', ['Hm? Who is there?', 'Did something move?', 'Show yourself.']),
  'guard-investigate': lines('guard-investigate', ['I will take a look.', 'Checking it.', 'Stay here, I am going over.']),
  'guard-found-body': lines('guard-found-body', ['Man down! Over here!', 'Someone got to him!']),
  'guard-halt': lines('guard-halt', ['Halt! Hands where I can see them!', 'Stop right there!']),
  'guard-alarm': lines('guard-alarm', ['Intruders! Sound the alarm!', 'Alarm! Alarm!']),
  'guard-all-clear': lines('guard-all-clear', ['Just the wind.', 'Rats again.', 'Nothing. All quiet.']),
  'guard-chatter': lines('guard-chatter', [
    'My fingers are frozen stiff, and the galley served us turnip paste that tasted like canal mud.',
    'Pull your greatcoat collar tight and stop whining, lad. The cold keeps you awake.',
    'They swear phantoms are slipping through the fog, snatching sentries off the line.',
    'There are no ghosts in Varrow, only salt mist and drafty piers.',
  ]),
};

export function squadLines(role: SpecialistId, key: SquadBarkKey): DialogueLine[] {
  return SQUAD_BARKS[role][key];
}
