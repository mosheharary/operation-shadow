'use client';

import type { SaveSlotId, SaveSummary } from '@operation-shadow/schemas';
import { useEffect, useRef, useState } from 'react';
import { type BindingAction, type Bindings, DEFAULT_BINDINGS, findConflicts, getBindings, keyLabel, primaryKey } from '../input/bindings';
import { useController } from '../runtime/game-context';
import { closeMenu, openMenu } from '../runtime/menus';
import { getActivePersistence, listSaves } from '../runtime/persistence';
import { type GameSettings, PRESETS, useSettings } from '../runtime/settings';
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

const ACTION_LABELS: Record<BindingAction, string> = {
  'pan-up': 'Pan up',
  'pan-down': 'Pan down',
  'pan-left': 'Pan left',
  'pan-right': 'Pan right',
  'rotate-left': 'Rotate left',
  'rotate-right': 'Rotate right',
  'camera-reset': 'Reset camera',
  track: 'Follow selected',
  pause: 'Tactical pause',
  stand: 'Stand',
  crouch: 'Crouch',
  prone: 'Prone',
  stop: 'Stop',
  cycle: 'Next squad member',
  'speed-down': 'Slower',
  'speed-up': 'Faster',
  help: 'Controls overlay',
  perf: 'Frame rate readout',
  quicksave: 'Quicksave',
  quickload: 'Quickload',
  hold: 'Wait for signal',
  signal: 'Give the signal',
  'select-1': 'Select specialist 1',
  'select-2': 'Select specialist 2',
  'select-3': 'Select specialist 3',
  'select-4': 'Select specialist 4',
  'select-5': 'Select specialist 5',
  'select-6': 'Select specialist 6',
  'slot-1': 'Ability slot 1',
  'slot-2': 'Ability slot 2',
  'slot-3': 'Ability slot 3',
  'slot-4': 'Ability slot 4',
  'slot-5': 'Ability slot 5',
  'slot-6': 'Ability slot 6',
  'slot-7': 'Ability slot 7',
  'slot-8': 'Ability slot 8',
  'slot-9': 'Ability slot 9',
  'slot-10': 'Ability slot 10',
};

/** Key remapping: click an action, press a key. Conflicts are listed and block applying. */
function KeyBindings() {
  const saved = useSettings((s) => s.keyBindings);
  const update = useSettings((s) => s.update);
  const [draft, setDraft] = useState<Bindings>(() => ({ ...DEFAULT_BINDINGS, ...saved }));
  const [listening, setListening] = useState<BindingAction | null>(null);
  const conflicts = findConflicts(draft);

  useEffect(() => {
    if (!listening) return;
    // Capture phase on window runs before the game's own key handlers, which never see this key.
    const capture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') setDraft((d) => ({ ...d, [listening]: [e.code, ...d[listening].slice(1).filter((c) => c !== e.code)] }));
      setListening(null);
    };
    window.addEventListener('keydown', capture, { capture: true });
    return () => window.removeEventListener('keydown', capture, { capture: true });
  }, [listening]);

  const apply = () => {
    const changed = Object.fromEntries(
      (Object.keys(draft) as BindingAction[]).filter((a) => draft[a].join() !== DEFAULT_BINDINGS[a].join()).map((a) => [a, draft[a]]),
    ) as Partial<Bindings>;
    update({ keyBindings: changed });
  };
  const dirty = (Object.keys(draft) as BindingAction[]).some((a) => draft[a].join() !== ({ ...DEFAULT_BINDINGS, ...saved } as Bindings)[a].join());

  return (
    <fieldset className={styles.settings} data-testid="key-bindings">
      <legend>Controls</legend>
      <div className={styles.bindings}>
        {(Object.keys(ACTION_LABELS) as BindingAction[]).map((action) => {
          const clash = conflicts.some((c) => c.actions.includes(action));
          return (
            <div key={action} className={styles.binding}>
              <span>{ACTION_LABELS[action]}</span>
              <button
                type="button"
                className={clash ? styles.bindingClash : styles.bindingKey}
                aria-label={`${ACTION_LABELS[action]}: ${draft[action].map(keyLabel).join(' or ')}. Change`}
                data-testid={`bind-${action}`}
                onClick={() => setListening(action)}
              >
                {listening === action ? 'Press a key…' : draft[action].map(keyLabel).join(' / ') || 'Unbound'}
              </button>
            </div>
          );
        })}
      </div>
      {conflicts.length > 0 && (
        <p className={styles.warning} role="alert">
          ⚠ Same key on two actions:{' '}
          {conflicts.map((c) => `${keyLabel(c.code)} (${c.actions.map((a) => ACTION_LABELS[a]).join(', ')})`).join('; ')}
        </p>
      )}
      <div className={styles.menuButtons}>
        <button type="button" className={styles.primaryButton} disabled={conflicts.length > 0 || !dirty} onClick={apply} data-testid="apply-bindings">
          Apply keys
        </button>
        <button type="button" className={styles.button} onClick={() => setDraft({ ...DEFAULT_BINDINGS })}>
          Reset to defaults
        </button>
      </div>
    </fieldset>
  );
}

function SettingsFields() {
  const settings = useSettings();
  const custom = (patch: Partial<GameSettings>) => settings.update({ ...patch, quality: 'custom' });
  return (
    <>
      <fieldset className={styles.settings}>
        <legend>Graphics</legend>
        <label>
          <span>Preset</span>
          <select
            value={settings.quality}
            onChange={(e) => {
              const quality = e.target.value as 'high' | 'low';
              if (quality in PRESETS) settings.update({ quality, ...PRESETS[quality] });
            }}
          >
            <option value="high">High (60 FPS tier)</option>
            <option value="low">Performance (30 FPS tier)</option>
            {settings.quality === 'custom' && <option value="custom">Custom</option>}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.shadows} onChange={(e) => custom({ shadows: e.target.checked })} />
          <span>Shadows</span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.postEffects} onChange={(e) => custom({ postEffects: e.target.checked })} />
          <span>Ambient occlusion, bloom and tilt-shift</span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.models} onChange={(e) => custom({ models: e.target.checked })} />
          <span>Detailed models (downloads about 15 MB)</span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.environment === 'rich'} onChange={(e) => custom({ environment: e.target.checked ? 'rich' : 'basic' })} />
          <span>Rich environment (sky light, grass, reflections)</span>
        </label>
        <label>
          <span>Resolution</span>
          <select value={settings.resolutionScale} onChange={(e) => custom({ resolutionScale: Number(e.target.value) })}>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150% (sharp on Retina)</option>
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.showFps} onChange={(e) => settings.update({ showFps: e.target.checked })} />
          <span>Show frame rate ({primaryKey('perf')})</span>
        </label>
      </fieldset>
      <fieldset className={styles.settings}>
        <legend>Audio</legend>
        {(['masterVolume', 'musicVolume', 'voiceVolume', 'effectsVolume'] as const).map((key) => (
          <label key={key}>
            <span>{{ masterVolume: 'Master volume', musicVolume: 'Music', voiceVolume: 'Voices', effectsVolume: 'Effects' }[key]}</span>
            <input type="range" min={0} max={1} step={0.05} value={settings[key]} onChange={(e) => settings.update({ [key]: Number(e.target.value) })} />
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.settings}>
        <legend>Accessibility and camera</legend>
        <label>
          <span>Interface size</span>
          <input type="range" min={0.75} max={1.5} step={0.05} value={settings.uiScale} onChange={(e) => settings.update({ uiScale: Number(e.target.value) })} />
          <output>{Math.round(settings.uiScale * 100)}%</output>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.subtitles} onChange={(e) => settings.update({ subtitles: e.target.checked })} />
          <span>Subtitles</span>
        </label>
        <label>
          <span>Subtitle size</span>
          <select value={settings.subtitleSize} onChange={(e) => settings.update({ subtitleSize: e.target.value as 'normal' | 'large' })}>
            <option value="normal">Normal</option>
            <option value="large">Large, solid background</option>
          </select>
        </label>
        <label>
          <span>Colours</span>
          <select value={settings.palette} onChange={(e) => settings.update({ palette: e.target.value as 'standard' | 'colorblind' })}>
            <option value="standard">Standard</option>
            <option value="colorblind">Colour-blind safe</option>
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.showNoise} onChange={(e) => settings.update({ showNoise: e.target.checked })} />
          <span>Show noise rings</span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.reducedShake} onChange={(e) => settings.update({ reducedShake: e.target.checked })} />
          <span>Reduce camera shake</span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.edgeScroll} onChange={(e) => settings.update({ edgeScroll: e.target.checked })} />
          <span>Scroll at screen edges</span>
        </label>
        <label>
          <span>Mouse rotate speed</span>
          <input type="range" min={0.5} max={2} step={0.1} value={settings.mouseSensitivity} onChange={(e) => settings.update({ mouseSensitivity: Number(e.target.value) })} />
        </label>
      </fieldset>
    </>
  );
}

export function SettingsMenu() {
  const controller = useController();
  const first = useAutoFocus<HTMLButtonElement>();
  return (
    <div className={styles.modalBackdrop}>
      <div className={`${styles.modal} ${styles.modalWide}`} role="dialog" aria-modal="true" aria-labelledby="settings-title" data-testid="settings-menu">
        <h2 id="settings-title" className={styles.modalTitle}>
          Settings
        </h2>
        <SettingsFields />
        <KeyBindings />
        <div className={styles.menuButtons}>
          <button ref={first} type="button" className={styles.primaryButton} onClick={() => openMenu(controller, 'pause')}>
            Back
          </button>
        </div>
      </div>
    </div>
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
          <button type="button" className={styles.button} onClick={() => openMenu(controller, 'saves')} data-testid="open-saves">
            Save / load
          </button>
          <button type="button" className={styles.button} onClick={() => openMenu(controller, 'help')}>
            Controls
          </button>
          <button type="button" className={styles.button} onClick={() => openMenu(controller, 'settings')} data-testid="open-settings">
            Settings
          </button>
          <button type="button" className={styles.button} onClick={onRestart}>
            Restart mission
          </button>
          <button type="button" className={styles.button} onClick={onExit}>
            Abort to briefing
          </button>
        </div>
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
      [['hold'], 'Wait for the signal (Shift: after current orders)'],
      [['signal'], 'Give the signal: everyone waiting moves at once'],
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
      [['quicksave', 'quickload'], 'Quicksave, quickload'],
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
const SLOT_LABEL: Record<SaveSlotId, string> = { quick: 'Quicksave', auto: 'Autosave', 'manual-1': 'Slot 1', 'manual-2': 'Slot 2', 'manual-3': 'Slot 3' };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Save into the three manual slots; load any slot (quick, auto, manual). */
export function SaveMenu() {
  const controller = useController();
  const first = useAutoFocus<HTMLButtonElement>();
  const [saves, setSaves] = useState<SaveSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void listSaves().then((list) => live && setSaves(list));
    return () => {
      live = false;
    };
  }, []);
  const persistence = getActivePersistence();
  const bySlot = new Map((saves ?? []).map((s) => [s.slot, s]));
  const run = async (task: () => Promise<boolean>, close: boolean) => {
    setBusy(true);
    const ok = await task();
    setBusy(false);
    if (ok && close) closeMenu(controller);
    else setSaves(await listSaves());
  };
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="saves-title" data-testid="save-menu">
        <h2 id="saves-title" className={styles.modalTitle}>
          Save / load
        </h2>
        {!persistence && <p className="hint">Saving is not available right now.</p>}
        {saves === null ? (
          <p className="hint">Loading your saves…</p>
        ) : (
          <ul className={styles.saveList}>
            {(['quick', 'auto', 'manual-1', 'manual-2', 'manual-3'] as const).map((slot) => {
              const save = bySlot.get(slot);
              const manual = slot.startsWith('manual');
              return (
                <li key={slot} data-testid={`save-${slot}`}>
                  <div>
                    <strong>{SLOT_LABEL[slot]}</strong>
                    <span className={styles.saveMeta}>
                      {save
                        ? `${save.missionTitle} · ${clock(save.seconds)} · ${save.objectivesDone}/${save.objectivesTotal} objectives · ${new Date(save.updatedAt).toLocaleString()}`
                        : 'Empty'}
                    </span>
                  </div>
                  <div className={styles.saveActions}>
                    {manual && persistence && (
                      <button type="button" className={styles.button} disabled={busy} onClick={() => void run(() => persistence.save(slot), false)}>
                        Save here
                      </button>
                    )}
                    {save && persistence && (
                      <button type="button" className={styles.button} disabled={busy} onClick={() => void run(() => persistence.load(slot), true)}>
                        Load
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className={styles.menuButtons}>
          <button ref={first} type="button" className={styles.primaryButton} onClick={() => openMenu(controller, 'pause')}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function MenuLayer(props: MenuCallbacks) {
  const menu = useGameUi((s) => s.menu);
  if (menu === 'pause') return <PauseMenu {...props} />;
  if (menu === 'saves') return <SaveMenu />;
  if (menu === 'settings') return <SettingsMenu />;
  if (menu === 'help') return <HelpOverlay />;
  return null;
}
