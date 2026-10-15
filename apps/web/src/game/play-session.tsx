'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AudioEngine } from './audio/audio-engine';
import { setActiveAudio } from './audio/registry';
import { Hud } from './hud/hud';
import { GameScene } from './render/game-scene';
import { type GameSetup, GameController } from './runtime/controller';
import { DialogueDirector } from './runtime/dialogue';
import { GameControllerProvider } from './runtime/game-context';
import { closeMenu } from './runtime/menus';
import { wireSessionEvents } from './runtime/session-events';
import { useSettings } from './runtime/settings';
import { useGameUi } from './runtime/store';
import styles from './play-session.module.css';

interface Session {
  controller: GameController;
  dialogue: DialogueDirector;
  audio: AudioEngine;
}

/** One mission attempt: builds the world off the first paint, then mounts the scene and HUD. */
export function PlaySession({ setup, title, fallback }: { setup: GameSetup; title: string; fallback: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    useSettings.getState().hydrate();
    useGameUi.getState().reset();
    // Let the loading screen paint before the level is generated on the main thread.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const controller = new GameController(setup);
        const dialogue = new DialogueDirector(() => controller.world);
        setSession({ controller, dialogue, audio: new AudioEngine(controller) });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The mission could not be prepared');
      }
    }, 30);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [setup]);

  useEffect(() => {
    if (!session) return;
    const { controller, dialogue, audio } = session;
    const unsubscribe = wireSessionEvents(controller, dialogue);
    audio.start(useSettings.getState());
    setActiveAudio(audio);
    const stopAudioEvents = controller.onEvents((events) => audio.handle(events));
    const stopVoices = dialogue.onLine((line) => audio.speak(line));
    const stopSettings = useSettings.subscribe((settings) => audio.applySettings(settings));
    const first = controller.world.state.operatives[0];
    if (first) useGameUi.getState().select([first.id]);
    // The simulation only advances while the scene renders, so unmounting stops it.
    return () => {
      unsubscribe();
      stopAudioEvents();
      stopVoices();
      stopSettings();
      setActiveAudio(null);
      audio.dispose();
    };
  }, [session]);

  const restart = useCallback(() => {
    if (!session) return;
    closeMenu(session.controller);
    useGameUi.getState().reset();
    session.controller.restart();
    const first = session.controller.world.state.operatives[0];
    if (first) useGameUi.getState().select([first.id]);
  }, [session]);

  const exit = useCallback(() => {
    session?.controller.setPaused(true);
    router.push(`/missions/${setup.missionKey}`);
  }, [router, session, setup.missionKey]);

  if (error) {
    return (
      <div className="game-loading" role="alert">
        <p className="eyebrow">{title}</p>
        <p className="game-loading__title">Operation could not start</p>
        <p className="hint">{error}</p>
      </div>
    );
  }
  if (!session) return <>{fallback}</>;

  return (
    <GameControllerProvider controller={session.controller}>
      <div className={styles.game} data-testid="game-root" onContextMenu={(e) => e.preventDefault()}>
        <div className={styles.canvas}>
          <GameScene controller={session.controller} audio={session.audio} testHooks />
        </div>
        <Hud onRestart={restart} onExit={exit} />
      </div>
    </GameControllerProvider>
  );
}
