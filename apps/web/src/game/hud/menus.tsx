'use client';

import { useEffect, useRef } from 'react';
import { type BindingAction, getBindings, keyLabel } from '../input/bindings';
import { useController } from '../runtime/game-context';
import { closeMenu, openMenu } from '../runtime/menus';
import { useSettings } from '../runtime/settings';
import { useGameUi } from '../runtime/store';
import styles from './hud.module.css';

export interface MenuCallbacks {
  onRestart: () => void;
  onExit: () => void;
}

/** Focuses the first control when a dialog opens, for keyboard users. */
function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

function SettingsFields() {
  const settings = useSettings();
  return (
    <fieldset className={styles.settings}>
      <legend>Settings</legend>
      <label>
        <span>Graphics</span>
        <select value={settings.quality} onChange={(e) => settings.update({ quality: e.target.value as 'high' | 'low' })}>
          <option value="high">High (shadows, sharp)</option>
          <option value="low">Performance (30 FPS tier)</option>
        </select>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={settings.subtitles} onChange={(e) => settings.update({ subtitles: e.target.checked })} />
        <span>Subtitles</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={settings.edgeScroll} onChange={(e) => settings.update({ edgeScroll: e.target.checked })} />
        <span>Scroll at screen edges</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={settings.reducedShake} onChange={(e) => settings.update({ reducedShake: e.target.checked })} />
        <span>Reduce camera shake</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={settings.showNoise} onChange={(e) => settings.update({ showNoise: e.target.checked })} />
        <span>Show noise rings</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={settings.showFps} onChange={(e) => settings.update({ showFps: e.target.checked })} />
        <span>Show frame rate (F3)</span>
      </label>
      {(['masterVolume', 'musicVolume', 'voiceVolume', 'effectsVolume'] as const).map((key) => (
        <label key={key}>
          <span>{{ masterVolume: 'Master volume', musicVolume: 'Music', voiceVolume: 'Voices', effectsVolume: 'Effects' }[key]}</span>
          <input type="range" min={0} max={1} step={0.05} value={settings[key]} onChange={(e) => settings.update({ [key]: Number(e.target.value) })} />
        </label>
      ))}
    </fieldset>
  );
}

export function PauseMenu({ onRestart, onExit }: MenuCallbacks) {
  const controller = useController();
  const first = useAutoFocus<HTMLButtonElement>();
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pause-title" data-testid="pause-menu">
        <p className="eyebrow">{controller.entry.title}</p>
        <h2 id="pause-title" className={styles.modalTitle}>
          Paused
        </h2>
        <div className={styles.menuButtons}>
          <button ref={first} type="button" className={styles.primaryButton} onClick={() => closeMenu(controller)}>
            Resume
          </button>
          <button type="button" className={styles.button} onClick={() => openMenu(controller, 'help')}>
            Controls
          </button>
          <button type="button" className={styles.button} onClick={onRestart}>
            Restart mission
          </button>
          <button type="button" className={styles.button} onClick={onExit}>
            Abort to briefing
          </button>
        </div>
        <SettingsFields />
      </div>
    </div>
  );
}

const HELP_GROUPS: { title: string; rows: [BindingAction[] | string, string][] }[] = [
  {
    title: 'Camera',
    rows: [
      [['pan-up', 'pan-left', 'pan-down', 'pan-right'], 'Pan'],
      [['rotate-left', 'rotate-right'], 'Rotate 45°'],
      ['Wheel', 'Zoom'],
      ['Middle drag', 'Free rotate and tilt'],
      [['track'], 'Follow the selected unit'],
      [['camera-reset'], 'Reset camera'],
    ],
  },
  {
    title: 'Squad',
    rows: [
      ['Left-click', 'Select (Shift adds), drag a box for several'],
      [['select-1', 'select-2', 'select-3'], 'Select by number (press twice to look)'],
      [['cycle'], 'Next squad member'],
      ['Right-click', 'Move, or the action shown under the cursor'],
      ['Double right-click', 'Run'],
      ['Shift + right-click', 'Queue the order'],
      [['stand', 'crouch', 'prone'], 'Stand, crouch, prone'],
      [['stop'], 'Stop'],
    ],
  },
  {
    title: 'Tactics',
    rows: [
      [['slot-1', 'slot-2', 'slot-3', 'slot-4'], 'Ability slots (see the bar)'],
      ['Esc / right-click', 'Cancel targeting'],
      ['Click a soldier', 'Pin his view cone'],
      ['Hold Alt', 'Show every view cone'],
      [['pause'], 'Tactical pause (orders still work)'],
      [['speed-down', 'speed-up'], 'Game speed'],
      [['perf'], 'Frame rate readout'],
    ],
  },
];

export function HelpOverlay() {
  const controller = useController();
  const first = useAutoFocus<HTMLButtonElement>();
  const bindings = getBindings();
  const keysFor = (actions: BindingAction[] | string) => (typeof actions === 'string' ? actions : actions.map((a) => keyLabel(bindings[a][0] ?? '')).join(' '));
  return (
    <div className={styles.modalBackdrop}>
      <div className={`${styles.modal} ${styles.modalWide}`} role="dialog" aria-modal="true" aria-labelledby="help-title" data-testid="help">
        <h2 id="help-title" className={styles.modalTitle}>
          Controls
        </h2>
        <div className={styles.helpGrid}>
          {HELP_GROUPS.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.rows.map(([keys, text]) => (
                  <div key={text}>
                    <dt>
                      <kbd>{keysFor(keys)}</kbd>
                    </dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <ul className={styles.tips}>
          <li>Green cones are calm soldiers; amber are suspicious; red and striped are alerted. The bright inner zone sees you even crouched.</li>
          <li>Crouch in tall grass and shadow to stay hidden. Prone is slow but nearly invisible beyond the inner zone.</li>
          <li>Unconscious soldiers wake up unless tied. Hide bodies: patrols that find one raise the alarm.</li>
          <li>Running, doors and gunshots make noise. Rings on the ground show how far a sound carries.</li>
        </ul>
        <div className={styles.menuButtons}>
          <button ref={first} type="button" className={styles.primaryButton} onClick={() => closeMenu(controller)}>
            Back to the mission
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mounts whichever in-game menu is open. */
export function MenuLayer(props: MenuCallbacks) {
  const menu = useGameUi((s) => s.menu);
  if (menu === 'pause') return <PauseMenu {...props} />;
  if (menu === 'help') return <HelpOverlay />;
  return null;
}
