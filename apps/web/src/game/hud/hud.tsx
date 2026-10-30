'use client';

import { AbilityBar } from './ability-bar';
import { Cinematic } from './cinematic';
import { ControlBar } from './controls';
import { Debrief } from './debrief';
import { EnemyInfo } from './enemy-info';
import { EventLog } from './event-log';
import { MenuLayer, type MenuCallbacks } from './menus';
import { DragBox, Subtitles, Toasts } from './messages';
import { Minimap } from './minimap';
import { ObjectivesPanel } from './objectives';
import { PerfReadout } from './perf-readout';
import { PlanningPanel } from './planning';
import { PortraitBar } from './portraits';
import { RecallReel } from './recall-reel';
import { StatusBar } from './status-bar';
import { TooltipLayer } from './tooltip';
import { TutorialPanel } from '../tutorial/tutorial-panel';
import { useController } from '../runtime/game-context';
import { useGameUi } from '../runtime/store';
import styles from './hud.module.css';

/** Screen-edge HUD (no permanent labels in the world). Empty areas pass pointer input to the 3D view. */
export function Hud(props: MenuCallbacks) {
  const controller = useController();
  const cinematic = useGameUi((s) => s.cinematic);
  const recalling = useGameUi((s) => s.recall !== null);
  return (
    // While a cinematic or the field recorder plays the panels fade out and only its own layer remains.
    <div className={styles.hud} data-cinematic={cinematic?.kind ?? (recalling ? 'recall' : undefined)}>
      {controller.entry.tutorial && <TutorialPanel />}
      <DragBox />
      <div className={styles.topLeft}>
        <PortraitBar />
        <EventLog />
      </div>
      <div className={styles.topCenter}>
        <StatusBar />
        <ControlBar />
        <PerfReadout />
        <Toasts />
      </div>
      <div className={styles.topRight}>
        <Minimap />
        <ObjectivesPanel />
        <EnemyInfo />
      </div>
      <div className={styles.bottomLeft}>
        <PlanningPanel />
      </div>
      <div className={styles.bottomCenter}>
        <Subtitles />
        <AbilityBar />
      </div>
      <MenuLayer {...props} />
      <Debrief {...props} />
      <TooltipLayer />
      <Cinematic />
      <RecallReel />
    </div>
  );
}
