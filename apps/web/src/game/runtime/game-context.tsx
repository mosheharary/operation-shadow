'use client';

import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { GameController } from './controller';

const GameControllerContext = createContext<GameController | null>(null);

export function GameControllerProvider({ controller, children }: { controller: GameController; children: ReactNode }) {
  return <GameControllerContext.Provider value={controller}>{children}</GameControllerContext.Provider>;
}

export function useController(): GameController {
  const controller = useContext(GameControllerContext);
  if (!controller) throw new Error('useController must be used inside GameControllerProvider');
  return controller;
}

/**
 * Re-renders the calling HUD component at the controller's HUD rate (10 Hz) and on pause or
 * restart. Components read `controller.world.state` directly during render.
 */
export function useHudTick(): GameController {
  const controller = useController();
  useSyncExternalStore(controller.subscribeHud, controller.getHudVersion, controller.getHudVersion);
  return controller;
}
