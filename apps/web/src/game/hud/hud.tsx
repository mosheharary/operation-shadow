'use client';

import { AbilityBar } from './ability-bar';
import { Debrief } from './debrief';
import { EnemyInfo } from './enemy-info';
import { EventLog } from './event-log';
import { MenuLayer, type MenuCallbacks } from './menus';
import { DragBox, Subtitles, Toasts } from './messages';
import { Minimap } from './minimap';
import { ObjectivesPanel } from './objectives';
import { PerfReadout } from './perf-readout';
import { PortraitBar } from './portraits';
import { StatusBar } from './status-bar';
import styles from './hud.module.css';

/** Screen-edge HUD (no permanent labels in the world). Empty areas pass pointer input to the 3D view. */
export function Hud(props: MenuCallbacks) {
  return (
    <div className={styles.hud}>
      <DragBox />
      <div className={styles.topLeft}>
        <PortraitBar />
        <EventLog />
      </div>
      <div className={styles.topCenter}>
        <StatusBar />
        <PerfReadout />
        <Toasts />
      </div>
      <div className={styles.topRight}>
        <Minimap />
        <ObjectivesPanel />
        <EnemyInfo />
      </div>
      <div className={styles.bottomCenter}>
        <Subtitles />
        <AbilityBar />
      </div>
      <MenuLayer {...props} />
      <Debrief {...props} />
    </div>
  );
}
