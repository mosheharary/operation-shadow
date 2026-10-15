import type { GameController } from './controller';
import { type GameUiState, useGameUi } from './store';

let resumeOnClose = false;

/** Opens an in-game menu and pauses the simulation; closing restores the previous pause state. */
export function openMenu(controller: GameController, menu: Exclude<GameUiState['menu'], 'none'>): void {
  const ui = useGameUi.getState();
  if (ui.menu === 'none') {
    resumeOnClose = !controller.paused;
    controller.setPaused(true);
  }
  ui.setMenu(menu);
}

export function closeMenu(controller: GameController): void {
  useGameUi.getState().setMenu('none');
  if (resumeOnClose) controller.setPaused(false);
  resumeOnClose = false;
}
