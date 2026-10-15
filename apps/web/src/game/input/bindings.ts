/**
 * Keyboard bindings. Every game action looks its keys up here, so the settings screen can remap
 * them later without touching the handlers. Codes are KeyboardEvent.code values (layout-independent).
 */
export type BindingAction =
  | 'pan-up'
  | 'pan-down'
  | 'pan-left'
  | 'pan-right'
  | 'rotate-left'
  | 'rotate-right'
  | 'camera-reset'
  | 'track'
  | 'pause'
  | 'stand'
  | 'crouch'
  | 'prone'
  | 'stop'
  | 'cycle'
  | 'speed-down'
  | 'speed-up'
  | 'help'
  | 'perf'
  | 'quicksave'
  | 'quickload'
  | 'hold'
  | 'signal'
  | 'select-1'
  | 'select-2'
  | 'select-3'
  | 'select-4'
  | 'select-5'
  | 'select-6'
  | 'slot-1'
  | 'slot-2'
  | 'slot-3'
  | 'slot-4'
  | 'slot-5'
  | 'slot-6'
  | 'slot-7'
  | 'slot-8'
  | 'slot-9'
  | 'slot-10';

export type Bindings = Record<BindingAction, string[]>;

export const SLOT_ACTIONS = ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'slot-6', 'slot-7', 'slot-8', 'slot-9', 'slot-10'] as const;
export const SELECT_ACTIONS = ['select-1', 'select-2', 'select-3', 'select-4', 'select-5', 'select-6'] as const;

export const DEFAULT_BINDINGS: Bindings = {
  'pan-up': ['KeyW', 'ArrowUp'],
  'pan-down': ['KeyS', 'ArrowDown'],
  'pan-left': ['KeyA', 'ArrowLeft'],
  'pan-right': ['KeyD', 'ArrowRight'],
  'rotate-left': ['KeyQ'],
  'rotate-right': ['KeyE'],
  'camera-reset': ['Home'],
  track: ['KeyT'],
  pause: ['Space'],
  stand: ['KeyZ'],
  crouch: ['KeyC'],
  prone: ['KeyX'],
  stop: ['KeyF'],
  cycle: ['Tab'],
  'speed-down': ['BracketLeft'],
  'speed-up': ['BracketRight'],
  help: ['F1', 'Slash'],
  perf: ['F3'],
  quicksave: ['F5'],
  quickload: ['F9'],
  hold: ['KeyL'],
  signal: ['Enter', 'NumpadEnter'],
  'select-1': ['Digit1'],
  'select-2': ['Digit2'],
  'select-3': ['Digit3'],
  'select-4': ['Digit4'],
  'select-5': ['Digit5'],
  'select-6': ['Digit6'],
  'slot-1': ['KeyR'],
  'slot-2': ['KeyG'],
  'slot-3': ['KeyV'],
  'slot-4': ['KeyB'],
  'slot-5': ['KeyY'],
  'slot-6': ['KeyH'],
  'slot-7': ['KeyN'],
  'slot-8': ['KeyJ'],
  'slot-9': ['KeyU'],
  'slot-10': ['KeyK'],
};

let active: Bindings = DEFAULT_BINDINGS;

export function getBindings(): Bindings {
  return active;
}

/** Replaces the active bindings (from saved preferences). Unknown actions fall back to defaults. */
export function setBindings(next: Partial<Bindings>): void {
  active = { ...DEFAULT_BINDINGS, ...next };
}

export function actionForCode(code: string, bindings: Bindings = active): BindingAction | null {
  for (const [action, codes] of Object.entries(bindings) as [BindingAction, string[]][]) {
    if (codes.includes(code)) return action;
  }
  return null;
}

export function isBound(action: BindingAction, code: string, bindings: Bindings = active): boolean {
  return bindings[action].includes(code);
}

/** Pairs of actions sharing a key; the settings screen refuses to save while any exist. */
export function findConflicts(bindings: Bindings): { code: string; actions: BindingAction[] }[] {
  const byCode = new Map<string, BindingAction[]>();
  for (const [action, codes] of Object.entries(bindings) as [BindingAction, string[]][]) {
    for (const code of codes) byCode.set(code, [...(byCode.get(code) ?? []), action]);
  }
  return [...byCode.entries()].filter(([, actions]) => actions.length > 1).map(([code, actions]) => ({ code, actions }));
}

/** Short label for a key code: KeyR → R, Digit1 → 1, BracketLeft → [. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const named: Record<string, string> = {
    BracketLeft: '[',
    BracketRight: ']',
    Slash: '?',
    Space: 'Space',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Escape: 'Esc',
  };
  return named[code] ?? code;
}

export function primaryKey(action: BindingAction, bindings: Bindings = active): string {
  const code = bindings[action][0];
  return code ? keyLabel(code) : '';
}
