import { SPECIALIST_PROFILES } from '@operation-shadow/content';
import { ALARM_LABELS, type GameEvent } from '@operation-shadow/engine';
import { ringRadius } from '../render/overlay';
import type { GameController } from './controller';
import type { DialogueDirector } from './dialogue';
import { useGameUi } from './store';

const LOUD = new Set(['gunshot', 'explosion', 'alarm-shout', 'shout', 'impact', 'device']);

/**
 * Routes simulation events to the HUD: noise rings, alarm and status warnings, and dialogue.
 * Returns the unsubscribe function.
 */
export function wireSessionEvents(controller: GameController, dialogue: DialogueDirector): () => void {
  return controller.onEvents((events: GameEvent[]) => {
    const ui = useGameUi.getState();
    const world = controller.world;
    const floor = world.state.env.noiseFloor;
    dialogue.handle(events);
    for (const e of events) {
      switch (e.type) {
        case 'footstep': {
          if (!e.unitId.startsWith('op:')) break;
          const radius = ringRadius(e.db, floor);
          if (radius > 1.2) ui.addNoiseRing({ pos: e.pos, radius, kind: 'footstep' });
          break;
        }
        case 'noise':
          if (e.kind === 'footstep') break;
          ui.addNoiseRing({ pos: e.pos, radius: ringRadius(e.db, floor), kind: e.kind === 'device' || e.kind === 'impact' ? 'lure' : LOUD.has(e.kind) ? 'loud' : 'footstep' });
          break;
        case 'detected': {
          const op = world.operative(e.targetId);
          if (op) ui.toast(`${SPECIALIST_PROFILES[op.role].callSign} has been spotted`, 'danger');
          break;
        }
        case 'alarm':
          if (e.level > e.previous) ui.toast(`Alarm: ${ALARM_LABELS[e.level]}`, e.level >= 3 ? 'danger' : 'warning');
          break;
        case 'all-clear':
          ui.toast('All clear: reinforcements are returning to barracks', 'info');
          break;
        case 'operative-status': {
          const op = world.operative(e.unitId);
          if (!op) break;
          const name = SPECIALIST_PROFILES[op.role].callSign;
          if (e.status === 'downed') ui.toast(`${name} is down. Get the medic or a dressing to them`, 'danger');
          else if (e.status === 'captured') ui.toast(`${name} has been captured`, 'danger');
          if (e.status !== 'active' && e.status !== 'downed') ui.select(ui.selected.filter((id) => id !== e.unitId));
          break;
        }
        case 'objective':
          if (e.status === 'completed') ui.toast('Objective complete', 'info');
          else if (e.status === 'active') ui.toast('New objective', 'info');
          break;
        default:
          break;
      }
    }
  });
}
