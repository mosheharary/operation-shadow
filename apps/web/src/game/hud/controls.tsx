'use client';

import { keyLabel, primaryKey } from '../input/bindings';
import { resetCamera, rotateCamera } from '../camera/camera-rig';
import { useHudTick } from '../runtime/game-context';
import { openMenu } from '../runtime/menus';
import { Icon, type IconName } from './icons';
import styles from './hud.module.css';

function ControlButton({ icon, label, tip, onClick, active = false, testId }: { icon: IconName; label: string; tip: string; onClick: () => void; active?: boolean; testId?: string }) {
  return (
    <button type="button" className={`${styles.control} ${active ? styles.controlActive : ''}`} aria-label={label} aria-pressed={active || undefined} data-tip={tip} data-tip-pos="below" data-testid={testId} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );
}

/** Always-visible buttons for pause, camera turning, the mission menu and leaving. */
export function ControlBar() {
  const controller = useHudTick();
  const running = controller.world.state.status === 'running';
  const paused = controller.paused;
  const quarter = Math.PI / 4;
  return (
    <div className={styles.controlBar} role="toolbar" aria-label="Game controls">
      <ControlButton
        icon={paused ? 'play' : 'pause'}
        label={paused ? 'Resume' : 'Pause'}
        tip={paused ? `Resume (${primaryKey('pause')})` : `Tactical pause (${primaryKey('pause')}): the action stops, but you can still give orders`}
        active={paused}
        testId="control-pause"
        onClick={() => running && controller.setPaused(!paused)}
      />
      <span className={styles.controlDivider} aria-hidden="true" />
      <ControlButton icon="rotate-left" label="Turn camera left" tip={`Turn the camera left (${primaryKey('rotate-left')}; hold to spin). Also: swipe sideways, or Option/Alt + drag`} onClick={() => rotateCamera(-quarter)} />
      <ControlButton icon="target" label="Reset camera" tip={`Reset the camera angle and zoom (${primaryKey('camera-reset')})`} onClick={resetCamera} />
      <ControlButton icon="rotate-right" label="Turn camera right" tip={`Turn the camera right (${primaryKey('rotate-right')}; hold to spin)`} onClick={() => rotateCamera(quarter)} />
      <span className={styles.controlDivider} aria-hidden="true" />
      <ControlButton icon="menu" label="Mission menu" tip={`Mission menu (${keyLabel('Escape')}): save, load, settings, controls`} testId="control-menu" onClick={() => openMenu(controller, 'pause')} />
      <ControlButton icon="exit" label="Exit without saving" tip="Leave the mission without saving (asks first)" testId="control-exit" onClick={() => openMenu(controller, 'exit')} />
    </div>
  );
}
