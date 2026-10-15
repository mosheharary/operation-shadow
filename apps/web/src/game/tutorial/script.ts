import type { Vec2, World } from '@operation-shadow/engine';
import { primaryKey } from '../input/bindings';

/** What a tutorial step can observe: the simulation, the selection and input the player used. */
export interface TutorialContext {
  world: World;
  selected: readonly string[];
  /** Input habits seen so far (camera keys, wheel, Alt for cones). */
  used: ReadonlySet<'pan' | 'rotate' | 'zoom' | 'cones' | 'pause'>;
}

export interface TutorialStep {
  id: string;
  title: string;
  /** Instruction text; keys come from the active bindings so remapping keeps it correct. */
  text: () => string;
  /** Where to look: a pulsing ring on the ground. */
  marker?: Vec2;
  /** Done when this holds; steps without a condition wait for "Continue". */
  done?: (ctx: TutorialContext) => boolean;
  /** Shown when the player seems stuck or did something counter-productive. */
  hint?: (ctx: TutorialContext) => string | null;
}

const near = (world: World, id: string, p: Vec2, r: number) => {
  const op = world.operative(id);
  return Boolean(op) && Math.hypot(op!.pos.x - p.x, op!.pos.z - p.z) <= r;
};
const guard = (world: World, id: string) => world.guard(id);
const spotted = (ctx: TutorialContext) => (ctx.world.state.stats.detections > 0 ? 'A sentry spotted you. That is fine here: keep going, or press Esc and restart to try again.' : null);

export const MOVE_MARKER: Vec2 = { x: 16, z: 31 };
export const GRASS_MARKER: Vec2 = { x: 30, z: 14 };
export const DRILL_MARKER: Vec2 = { x: 42, z: 15 };
export const FENCE_MARKER: Vec2 = { x: 59.5, z: 42 };

/** Boot Camp, step by step: every control a first-time player needs, in the order they need it. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Boot Camp',
    text: () =>
      'You command Shadow Section, a squad of specialists, from above. Tonight you train with two of them: MOTH, the Infiltrator, and BADGER, the Combat Engineer. Follow these instructions; the game is paused for you between steps whenever you like with Space.',
  },
  {
    id: 'select',
    title: 'Select a specialist',
    text: () => `Select MOTH: click his portrait at the top left, press ${primaryKey('select-1')}, or left-click him on the ground.`,
    done: (ctx) => ctx.selected.length === 1 && ctx.selected[0] === 'op:infiltrator',
  },
  {
    id: 'move',
    title: 'Move',
    text: () => 'Right-click the ground to move the selected specialist. Send MOTH to the glowing ring on the track. Double right-click to run.',
    marker: MOVE_MARKER,
    done: (ctx) => near(ctx.world, 'op:infiltrator', MOVE_MARKER, 2.5),
  },
  {
    id: 'camera',
    title: 'Look around',
    text: () =>
      `Move the camera with ${primaryKey('pan-up')} ${primaryKey('pan-left')} ${primaryKey('pan-down')} ${primaryKey('pan-right')} (or the arrow keys), rotate it with ${primaryKey('rotate-left')} and ${primaryKey('rotate-right')}, and zoom with the mouse wheel. Try at least two of them. ${primaryKey('camera-reset')} resets the view.`,
    done: (ctx) => ['pan', 'rotate', 'zoom'].filter((k) => ctx.used.has(k as 'pan')).length >= 2,
  },
  {
    id: 'group',
    title: 'Command the squad',
    text: () => 'Select both specialists: drag a box around them with the left mouse button, or press Ctrl+A. Orders then go to everyone selected.',
    done: (ctx) => ctx.selected.includes('op:infiltrator') && ctx.selected.includes('op:engineer'),
  },
  {
    id: 'cones',
    title: 'Read the sentries',
    text: () =>
      'A sentry watches the grass field from the north-east. Hold Alt to see every view cone. Green is calm, amber suspicious, red alerted. The bright inner zone sees you even when you crouch; the outer zone only sees you standing or in light.',
    done: (ctx) => ctx.used.has('cones'),
  },
  {
    id: 'crouch',
    title: 'Stay low',
    text: () =>
      `Select MOTH (${primaryKey('select-1')}) and press ${primaryKey('crouch')} to crouch. Crouched in tall grass you are nearly invisible outside the inner zone. Move him through the grass to the ring in the field. ${primaryKey('stand')} stands up again, ${primaryKey('prone')} goes prone.`,
    marker: GRASS_MARKER,
    done: (ctx) => near(ctx.world, 'op:infiltrator', GRASS_MARKER, 2.5),
    hint: (ctx) => {
      const op = ctx.world.operative('op:infiltrator');
      if (op && op.stance === 'stand') return 'MOTH is standing. Press ' + primaryKey('crouch') + ' to crouch before you enter the field.';
      return spotted(ctx);
    },
  },
  {
    id: 'takedown',
    title: 'Silent takedown',
    text: () =>
      'Another sentry stands in the drill yard with his back to you. Move MOTH behind him, then right-click the sentry: MOTH knocks him out. The bar at the bottom tells you what a right-click will do before you click.',
    marker: DRILL_MARKER,
    done: (ctx) => guard(ctx.world, 'g:drill')?.status !== 'active',
    hint: spotted,
  },
  {
    id: 'tie',
    title: 'Tie him up',
    text: () => 'Knocked-out soldiers wake up after a while and raise the alarm. Right-click him again with MOTH to tie him up with rope.',
    done: (ctx) => {
      const g = guard(ctx.world, 'g:drill');
      return g?.status === 'restrained' || g?.status === 'dead' || Boolean(g?.hiddenIn);
    },
  },
  {
    id: 'hide',
    title: 'Hide the body',
    text: () => 'Patrols that find a body raise the alarm. Right-click the body to carry it, then right-click the crate next to the yard to hide it.',
    done: (ctx) => Boolean(guard(ctx.world, 'g:drill')?.hiddenIn),
  },
  {
    id: 'lockpick',
    title: 'Pick a lock',
    text: () =>
      `The training papers are in the stone armory, and its door is locked. Only the Combat Engineer picks locks: select BADGER (${primaryKey('select-2')}) and right-click the armory door.`,
    done: (ctx) => {
      const door = ctx.world.state.objects.find((o) => o.id.startsWith('door:armory'));
      return door?.type === 'door' && !door.locked;
    },
  },
  {
    id: 'steal',
    title: 'Take the papers',
    text: () => 'Go inside and right-click the papers on the table to pick them up. The roof lifts away while one of your squad is inside.',
    done: (ctx) => ctx.world.state.objectives.find((o) => o.id === 'obj:papers')?.status === 'completed',
  },
  {
    id: 'fence',
    title: 'Get past the fence',
    text: () =>
      `A sentry stands outside the gate in the east fence. Never walk through his gate. Let BADGER cut the wire at the ring further south, where nobody is looking (right-click the fence there), or lure the sentry away: choose Throw stone (${primaryKey('slot-6')}) and left-click a spot away from the gate, then slip through while he looks.`,
    marker: FENCE_MARKER,
    done: (ctx) => {
      const fence = ctx.world.state.objects.find((o) => o.type === 'fence');
      return (fence?.type === 'fence' && fence.cutCells.length > 0) || ctx.world.state.operatives.some((op) => op.pos.x > 61);
    },
    hint: spotted,
  },
  {
    id: 'regroup',
    title: 'Regroup',
    text: () =>
      'Orders take the shortest way, and the shortest way may lead past a sentry. Bring MOTH to BADGER at the gap first, keeping well away from the gate.',
    marker: FENCE_MARKER,
    done: (ctx) => ctx.world.state.operatives.every((op) => op.status !== 'active' || near(ctx.world, op.id, FENCE_MARKER, 4) || op.pos.x > 61),
    hint: spotted,
  },
  {
    id: 'extract',
    title: 'Extract',
    text: () => 'Now select both and right-click inside the green outline beyond the fence. Every surviving squad member must be there to finish a mission.',
    done: (ctx) => ctx.world.state.status !== 'running',
  },
  {
    id: 'finished',
    title: 'Exercise complete',
    text: () =>
      'That is everything you need. In the field you will also have OWL (Recon), FOX (Deception), HERON (Field Medic) and OTTER (Marine), each with their own skills on the ability bar. F1 shows every control at any time.',
  },
];

/** Index of the first step whose condition does not hold yet, starting from `from`. */
export function advanceTutorial(steps: readonly TutorialStep[], from: number, ctx: TutorialContext): number {
  let i = from;
  while (i < steps.length - 1 && steps[i]!.done?.(ctx)) i += 1;
  return i;
}
