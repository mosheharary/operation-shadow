import { type SimState, TICK_RATE, type Vec2 } from '@operation-shadow/engine';
import { activeAudio } from '../audio/registry';
import { type CameraView, getCameraView, setCameraView } from '../camera/camera-rig';
import { stopReel } from '../camera/cinematic';
import type { GameController } from './controller';
import { getActivePersistence } from './persistence';
import { openingFrame } from './recall';
import { useGameUi } from './store';

/** The moment the recorder was opened, put back if the player changes their mind. */
let present: { state: SimState; paused: boolean; speed: number; view: CameraView | null } | null = null;

/** Mission time when the recorder was opened (for "−8 s" on the reel). */
export function recallPresentTick(): number {
  return present?.state.tick ?? 0;
}

/** True when there is something to wind back to: not in the tutorial, nor after a win. */
export function canRecall(controller: GameController): boolean {
  const s = controller.world.state;
  if (controller.entry.tutorial || s.status === 'success') return false;
  return controller.tape.frames.some((f) => f.tick < s.tick);
}

/** Where the camera looks on a frame: the lead squad member, or the squad's middle. */
function frameFocus(state: SimState): Vec2 | null {
  const active = state.operatives.filter((op) => op.status === 'active' || op.status === 'downed');
  const lead = active.find((op) => op.id === useGameUi.getState().selected[0]) ?? null;
  if (lead) return { ...lead.pos };
  if (active.length === 0) return null;
  return { x: active.reduce((s, op) => s + op.pos.x, 0) / active.length, z: active.reduce((s, op) => s + op.pos.z, 0) / active.length };
}

/** Shows an earlier frame: the world itself is put back, so the scene plays the past. */
export function previewRecall(controller: GameController, index: number): void {
  const ui = useGameUi.getState();
  const frames = controller.tape.frames;
  const i = Math.max(0, Math.min(frames.length - 1, index));
  const frame = frames[i];
  if (!present || !frame || ui.recall?.index === i) return;
  controller.rewind(frame.state);
  ui.setRecall({ index: i });
  const focus = frameFocus(frame.state);
  if (focus) ui.focusCamera(focus);
  activeAudio()?.rewind();
}

/**
 * Opens the field recorder: the clock is held, the HUD steps aside and the world winds back to
 * just before the latest trouble. A failed mission can be wound back from its debrief.
 */
export function openRecall(controller: GameController): void {
  const ui = useGameUi.getState();
  if (ui.recall || ui.menu !== 'none' || ui.cinematic?.kind === 'intro') return;
  if (!canRecall(controller)) {
    ui.toast(controller.entry.tutorial ? 'The field recorder is not used in Boot Camp' : 'Nothing on the field recorder yet', 'info');
    return;
  }
  // The closing shot of a failed mission gives way to the recorder.
  stopReel();
  ui.setCinematic(null);
  ui.setTargeting(null);
  ui.setTracking(false);
  present = { state: controller.world.snapshot(), paused: controller.paused, speed: controller.speed, view: getCameraView() };
  controller.setHeld(true);
  const frames = controller.tape.frames;
  let index = openingFrame(frames);
  while (index > 0 && frames[index]!.tick >= present.state.tick) index -= 1;
  // Not a preview of the same index: force the first wind.
  ui.setRecall({ index: -1 });
  previewRecall(controller, index);
}

/** Plays on from the frame on screen; everything taped after it is gone. */
export function resumeRecall(controller: GameController): void {
  const ui = useGameUi.getState();
  const recall = ui.recall;
  if (!present || !recall) return;
  const failed = present.state.status !== 'running';
  const back = Math.round((present.state.tick - controller.world.state.tick) / TICK_RATE);
  controller.tape.cut(recall.index);
  controller.trace.cut(controller.world.state.tick);
  controller.recalls += 1;
  present = null;
  ui.setRecall(null);
  ui.select(ui.selected.filter((id) => controller.world.operative(id)?.status === 'active'));
  if (useGameUi.getState().selected.length === 0) {
    const first = controller.world.state.operatives.find((op) => op.status === 'active');
    if (first) ui.select([first.id]);
  }
  // Back in tactical pause, so the new plan can be given before anything moves.
  controller.setPaused(true);
  controller.setHeld(false);
  if (failed) getActivePersistence()?.reopen();
  ui.toast(`Wound back ${back} s. Paused: give your orders, then resume`, 'info');
}

/** Closes the recorder and puts the world back exactly as it was when it opened. */
export function cancelRecall(controller: GameController): void {
  const ui = useGameUi.getState();
  if (!present) {
    ui.setRecall(null);
    return;
  }
  const { state, paused, speed, view } = present;
  present = null;
  controller.rewind(state);
  if (view) setCameraView(view);
  controller.speed = speed;
  controller.paused = paused;
  ui.setRecall(null);
  controller.setHeld(false);
}
