import { type GeneratedMissionData, generatedMissionEntry, getMission, type MissionEntry } from '@operation-shadow/content';
import {
  type Command,
  type CommandResult,
  DT,
  type DifficultyId,
  type GameEvent,
  type LevelData,
  type MissionRuntime,
  type SpecialistId,
  type Vec2,
  World,
} from '@operation-shadow/engine';

export interface GameSetup {
  missionKey: string;
  squad: SpecialistId[];
  difficulty: DifficultyId;
  seed: number;
  /** A generated operation (its key starts with `op-`), already validated by the server. */
  generated?: GeneratedMissionData;
}

type EventListener = (events: GameEvent[]) => void;

const HUD_INTERVAL_MS = 100;
const MAX_FRAME_SECONDS = 0.25;

/**
 * Owns one mission session: the deterministic World, a fixed-step clock driven by the render
 * loop, render interpolation, and fan-out of simulation events. Contains no React.
 */
export class GameController {
  readonly entry: MissionEntry;
  readonly level: LevelData;
  readonly mission: MissionRuntime;
  world: World;
  /** Simulation speed multiplier (1 = real time). */
  speed = 1;
  paused = false;
  /** Interpolation factor between the previous and current tick (0..1). */
  alpha = 1;

  private accumulator = 0;
  private readonly previous = new Map<string, { x: number; z: number; facing: number }>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly hudListeners = new Set<() => void>();
  private hudVersion = 0;
  private lastHud = 0;

  constructor(readonly setup: GameSetup) {
    const entry = setup.generated ? generatedMissionEntry(setup.generated) : getMission(setup.missionKey);
    if (!entry) throw new Error(`Unknown mission ${setup.missionKey}`);
    this.entry = entry;
    const built = entry.build();
    this.level = built.level;
    this.mission = built.mission;
    this.world = World.create(this.level, this.mission, { seed: setup.seed, squad: setup.squad, difficulty: setup.difficulty });
  }

  /** Advances the simulation by real elapsed time; call once per rendered frame. */
  advance(dtSeconds: number): void {
    const s = this.world.state;
    if (!this.paused && s.status === 'running') {
      this.accumulator += Math.min(dtSeconds, MAX_FRAME_SECONDS) * this.speed;
      let steps = 0;
      while (this.accumulator >= DT && steps < 12) {
        this.capturePrevious();
        const events = this.world.step();
        this.accumulator -= DT;
        steps += 1;
        if (events.length > 0) for (const listener of this.eventListeners) listener(events);
      }
      this.alpha = Math.min(1, this.accumulator / DT);
    } else {
      this.alpha = 1;
    }
    const now = performance.now();
    if (now - this.lastHud >= HUD_INTERVAL_MS) {
      this.lastHud = now;
      this.notifyHud();
    }
  }

  private capturePrevious(): void {
    const s = this.world.state;
    for (const op of s.operatives) this.previous.set(op.id, { x: op.pos.x, z: op.pos.z, facing: op.facing });
    for (const g of s.guards) this.previous.set(g.id, { x: g.pos.x, z: g.pos.z, facing: g.facing + g.look });
    for (const o of s.objects) if (o.type === 'prisoner') this.previous.set(o.id, { x: o.pos.x, z: o.pos.z, facing: 0 });
  }

  /** Render position between the last two ticks. */
  interpolate(id: string, current: Vec2): Vec2 {
    const prev = this.previous.get(id);
    if (!prev) return current;
    const dx = current.x - prev.x;
    const dz = current.z - prev.z;
    // Teleports (captures, loads) snap instead of sliding.
    if (dx * dx + dz * dz > 25) return current;
    return { x: prev.x + dx * this.alpha, z: prev.z + dz * this.alpha };
  }

  command(command: Command): CommandResult {
    return this.world.enqueue(command);
  }

  onEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  // useSyncExternalStore adapter for HUD components.
  subscribeHud = (listener: () => void): (() => void) => {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  };

  getHudVersion = (): number => this.hudVersion;

  notifyHud(): void {
    this.hudVersion += 1;
    for (const listener of this.hudListeners) listener();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.notifyHud();
  }

  restart(seed = this.setup.seed): void {
    this.world = World.create(this.level, this.mission, { seed, squad: this.setup.squad, difficulty: this.setup.difficulty });
    this.previous.clear();
    this.accumulator = 0;
    this.paused = false;
    this.speed = 1;
    this.notifyHud();
  }
}
