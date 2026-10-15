import { distance, headingTo, type Vec2 } from '../core/math';
import { DT, type MovePathPoint } from './types';
import type { World } from './world';

export interface PathProgress {
  index: number;
  linkProgress: number;
  arrived: boolean;
  /** Metres moved this tick (0 while traversing a link). */
  moved: number;
  onLink: boolean;
}

/**
 * Advances an agent along a path for one tick at `speed` m/s. Link segments (climbs) take their
 * fixed duration. Opens unlocked doors the agent walks into. Mutates `agent.pos` and `agent.facing`.
 */
export function followPath(
  world: World,
  agent: { pos: Vec2; facing: number },
  path: MovePathPoint[],
  index: number,
  linkProgress: number,
  speed: number,
  agentId: string,
): PathProgress {
  let budget = speed * DT;
  let moved = 0;
  let i = index;
  let progress = linkProgress;
  while (i < path.length) {
    const target = path[i]!;
    if (target.link) {
      const from = path[i - 1] ?? agent.pos;
      const duration = Math.max(DT, target.link.duration);
      progress += DT / duration;
      const t = Math.min(1, progress);
      agent.pos = { x: from.x + (target.x - from.x) * t, z: from.z + (target.z - from.z) * t };
      agent.facing = headingTo(from, target);
      if (progress >= 1) {
        progress = 0;
        i += 1;
        // A finished climb ends this tick's movement.
      }
      return { index: i, linkProgress: progress, arrived: i >= path.length, moved: 0, onLink: progress > 0 };
    }
    const d = distance(agent.pos, target);
    if (d > 1e-6) agent.facing = headingTo(agent.pos, target);
    if (d <= budget) {
      agent.pos = { x: target.x, z: target.z };
      budget -= d;
      moved += d;
      i += 1;
      world.openDoorAt(agent.pos, agentId);
      continue;
    }
    const t = budget / d;
    agent.pos = { x: agent.pos.x + (target.x - agent.pos.x) * t, z: agent.pos.z + (target.z - agent.pos.z) * t };
    moved += budget;
    world.openDoorAt(agent.pos, agentId);
    break;
  }
  return { index: i, linkProgress: progress, arrived: i >= path.length, moved, onLink: false };
}
