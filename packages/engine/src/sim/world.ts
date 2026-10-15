import { distance, type Vec2 } from '../core/math';
import { Rng } from '../core/rng';
import { DynamicGrid } from '../level/dynamic';
import { Grid } from '../level/grid';
import type { LevelData, PatrolRouteDef, PostDef } from '../level/types';
import { Pathfinder, type PathResult } from '../nav/pathfinder';
import { type SightContext, visibilityFan, type VisibilityFan } from '../sight/los';
import type { SoundContext } from '../sound/propagation';
import { raiseAlarm, updateAlarm } from './alarm';
import type { Command, CommandResult } from './commands';
import { updateDirector } from './director';
import type { GameEvent } from './events';
import { alertGuardTo, disableGuard, dispatchToSearch, distractGuard, endDistraction, updateGuards } from './guards';
import type { MissionRuntime } from './mission';
import { updateObjectives } from './objectives';
import { updateOperatives } from './operatives';
import { applyCommand, navProfileFor, validateCommand } from './orders';
import { isObservedBy, updatePerception, visionParams } from './perception';
import { DIFFICULTY, type DifficultyRules, NOISE_DB } from './rules';
import { createGuard, createInitialState, type WorldSetup } from './setup';
import { updateWorldTimers } from './timers';
import type {
  AbilityTarget,
  AlarmLevel,
  DoorObject,
  FenceObject,
  Guard,
  LogEntry,
  NoiseKind,
  Operative,
  SimState,
  WorldObject,
} from './types';

const MAX_LOG = 60;

/**
 * The deterministic mission simulation. All gameplay state lives in `state` (plain, serializable
 * data); everything else is derived and rebuilt on restore. Advance with step() at 20 Hz.
 */
export class World {
  readonly grid: Grid;
  readonly dynamic: DynamicGrid;
  readonly pathfinder: Pathfinder;
  readonly sight: SightContext;
  readonly sound: SoundContext;
  readonly rules: DifficultyRules;
  rng: Rng;

  private events: GameEvent[] = [];
  private pending: Command[] = [];
  private readonly operatives = new Map<string, Operative>();
  private readonly guards = new Map<string, Guard>();
  private readonly objects = new Map<string, WorldObject>();
  private readonly doorByCell = new Map<number, string>();
  private readonly prisonerPaths = new Map<string, { points: Vec2[]; index: number; tick: number }>();
  private readonly posts: Map<string, PostDef>;
  private readonly routes: Map<string, PatrolRouteDef>;

  constructor(
    readonly level: LevelData,
    readonly mission: MissionRuntime,
    public state: SimState,
  ) {
    this.grid = new Grid(level);
    this.dynamic = new DynamicGrid(level);
    this.pathfinder = new Pathfinder(level, this.dynamic);
    this.sight = { level, grid: this.grid, dynamic: this.dynamic, smoke: state.smoke };
    this.sound = { level, grid: this.grid, dynamic: this.dynamic };
    this.rules = DIFFICULTY[state.difficulty];
    this.rng = new Rng(state.rng);
    this.posts = new Map(level.posts.map((p) => [p.id, p]));
    this.routes = new Map(level.routes.map((r) => [r.id, r]));
    this.rebuildIndexes();
    this.rebuildDynamic();
  }

  static create(level: LevelData, mission: MissionRuntime, setup: WorldSetup): World {
    return new World(level, mission, createInitialState(level, mission, setup));
  }

  /** Rebuilds a world from a saved state (deep-copied, so the caller's object is never mutated). */
  static restore(level: LevelData, mission: MissionRuntime, state: SimState): World {
    if (state.schemaVersion !== 1) throw new Error(`Unsupported save schema version ${String(state.schemaVersion)}`);
    if (state.levelId !== level.id || state.missionId !== mission.id) throw new Error('Saved state belongs to a different mission');
    return new World(level, mission, structuredClone(state));
  }

  snapshot(): SimState {
    return structuredClone(this.state);
  }

  // ── Lookups ───────────────────────────────────────────────────────────────────────────────

  operative(id: string): Operative | undefined {
    return this.operatives.get(id);
  }

  guard(id: string): Guard | undefined {
    return this.guards.get(id);
  }

  object(id: string): WorldObject | undefined {
    return this.objects.get(id);
  }

  post(id: string): PostDef | undefined {
    return this.posts.get(id);
  }

  route(id: string): PatrolRouteDef | undefined {
    return this.routes.get(id);
  }

  private rebuildIndexes(): void {
    this.operatives.clear();
    this.guards.clear();
    this.objects.clear();
    this.doorByCell.clear();
    for (const op of this.state.operatives) this.operatives.set(op.id, op);
    for (const g of this.state.guards) this.guards.set(g.id, g);
    for (const obj of this.state.objects) this.indexObject(obj);
  }

  indexObject(obj: WorldObject): void {
    this.objects.set(obj.id, obj);
    if (obj.type === 'door') for (const cell of obj.cells) this.doorByCell.set(cell, obj.id);
  }

  removeObject(id: string): void {
    this.state.objects = this.state.objects.filter((o) => o.id !== id);
    this.objects.delete(id);
  }

  /** Re-applies doors, cut fences and other runtime changes to the dynamic grid. */
  rebuildDynamic(): void {
    this.dynamic.reset();
    for (const obj of this.state.objects) {
      if (obj.type === 'door') {
        if (obj.locked) this.dynamic.block(obj.cells, { occlusion: 2.3, soundDamping: 12 });
        else if (!obj.open) this.dynamic.occlude(obj.cells, 2.3, 12);
      } else if (obj.type === 'fence' && obj.cutCells.length > 0) {
        this.dynamic.open(obj.cutCells);
      }
    }
  }

  // ── Event and state helpers ──────────────────────────────────────────────────────────────

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  log(kind: LogEntry['kind'], text: string): void {
    const entry: LogEntry = { tick: this.state.tick, kind, text };
    this.state.log.push(entry);
    if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);
    this.emit({ type: 'log', entry });
  }

  newId(prefix: string): string {
    const id = `${prefix}:${this.state.nextId}`;
    this.state.nextId += 1;
    return id;
  }

  noise(pos: Vec2, db: number, kind: NoiseKind, sourceId: string | null): void {
    this.state.noises.push({ id: this.state.nextId++, pos: { ...pos }, db, kind, sourceId, tick: this.state.tick });
    this.emit({ type: 'noise', pos: { ...pos }, kind, db, sourceId });
  }

  raiseAlarm(level: AlarmLevel, reason: string, sector: string, pos: Vec2): void {
    raiseAlarm(this, level, reason, sector, pos);
  }

  setDoor(door: DoorObject, open: boolean, byId: string): void {
    if (door.open === open) return;
    door.open = open;
    this.rebuildDynamic();
    this.emit({ type: 'door', objectId: door.id, open });
    this.noise(door.pos, NOISE_DB.door, 'door', byId);
  }

  /** Agents push through closed, unlocked doors as they walk. */
  openDoorAt(pos: Vec2, agentId: string): void {
    const cell = this.grid.cellAt(pos);
    const doorId = this.doorByCell.get(cell);
    if (!doorId) return;
    const door = this.objects.get(doorId);
    if (door?.type === 'door' && !door.open && !door.locked) this.setDoor(door, true, agentId);
  }

  /** Centre of the fence cell closest to a point: a long fence is approached and cut where aimed. */
  fenceCellNear(fence: FenceObject, near: Vec2): Vec2 {
    let nearest = fence.cells[0];
    let best = Infinity;
    for (const cell of fence.cells) {
      const d = distance(this.grid.center(cell), near);
      if (d < best) {
        best = d;
        nearest = cell;
      }
    }
    return nearest === undefined ? fence.pos : this.grid.center(nearest);
  }

  cutFence(fence: FenceObject, near: Vec2): void {
    if (fence.cells.length === 0) return;
    const centre = this.fenceCellNear(fence, near);
    fence.cutCells = fence.cells.filter((cell) => distance(this.grid.center(cell), centre) <= 0.8);
    this.rebuildDynamic();
    this.log('info', 'Fence cut open');
  }

  disableGuard(g: Guard, status: 'ko' | 'dead'): void {
    disableGuard(this, g, status);
  }

  alertGuardTo(g: Guard, targetId: string, pos: Vec2): void {
    alertGuardTo(this, g, targetId, pos);
  }

  distractGuard(g: Guard, op: Operative): void {
    distractGuard(this, g, op);
  }

  endDistraction(guardId: string): void {
    endDistraction(this, guardId);
  }

  reviveOperative(op: Operative, health: number): void {
    if (op.status !== 'downed') return;
    op.status = 'active';
    op.health = Math.min(op.maxHealth, health);
    op.bleedOut = 0;
    this.emit({ type: 'operative-status', unitId: op.id, status: 'active' });
    this.log('success', `${op.role} is back on their feet`);
  }

  killOperative(op: Operative, cause: string): void {
    if (op.status === 'dead') return;
    op.status = 'dead';
    op.health = 0;
    op.action = null;
    op.queue = [];
    if (op.carrying) this.dropCarried(op);
    this.emit({ type: 'operative-status', unitId: op.id, status: 'dead' });
    this.log('danger', `${op.role} was killed (${cause})`);
  }

  dropCarried(op: Operative): void {
    const body = op.carrying ? this.guards.get(op.carrying) : undefined;
    if (body) {
      body.carriedBy = null;
      body.pos = { ...op.pos };
    }
    op.carrying = null;
  }

  isObserved(op: Operative): boolean {
    return isObservedBy(this, op);
  }

  resolveTargetPos(target: AbilityTarget, from?: Vec2): Vec2 | null {
    if (target.kind === 'point') return target.pos;
    if (target.kind === 'self') return null;
    const obj = this.objects.get(target.id);
    if (obj?.type === 'fence') return this.fenceCellNear(obj, target.at ?? from ?? obj.pos);
    return this.guards.get(target.id)?.pos ?? obj?.pos ?? this.operatives.get(target.id)?.pos ?? null;
  }

  /** Sector of a restricted zone containing the point, or null. */
  restrictedZoneAt(pos: Vec2): string | null {
    for (const zone of this.level.zones) {
      if (zone.kind === 'restricted' && pos.x >= zone.min.x && pos.x <= zone.max.x && pos.z >= zone.min.z && pos.z <= zone.max.z) return zone.id;
    }
    return null;
  }

  sectorAt(pos: Vec2): string {
    for (const zone of this.level.zones) {
      if (zone.kind === 'sector' && pos.x >= zone.min.x && pos.x <= zone.max.x && pos.z >= zone.min.z && pos.z <= zone.max.z) return zone.id;
    }
    return 'main';
  }

  holdingPoint(): Vec2 | null {
    const zone = this.mission.holdingZoneId ? this.level.zones.find((z) => z.id === this.mission.holdingZoneId) : undefined;
    return zone ? { x: (zone.min.x + zone.max.x) / 2, z: (zone.min.z + zone.max.z) / 2 } : null;
  }

  prisonerPath(id: string, from: Vec2, to: Vec2): Vec2 | null {
    let cached = this.prisonerPaths.get(id);
    if (!cached || this.state.tick - cached.tick > 20 || cached.index >= cached.points.length) {
      const res = this.pathfinder.findPath(from, to, { swim: false, climb: false });
      if (!res.ok) return null;
      cached = { points: res.points, index: 1, tick: this.state.tick };
      this.prisonerPaths.set(id, cached);
    }
    while (cached.index < cached.points.length && distance(from, cached.points[cached.index]!) < 0.2) cached.index += 1;
    return cached.points[cached.index] ?? null;
  }

  spawnReinforcement(sector: string, pos: Vec2, searchCenter: Vec2): void {
    const id = this.newId('g:reinforcement');
    const guard = createGuard(this.level, { id, archetype: 'rifleman', rank: 'soldier', temperament: 'strict', sector, pos, radio: false });
    this.state.guards.push(guard);
    this.guards.set(guard.id, guard);
    dispatchToSearch(this, guard, searchCenter);
  }

  // ── Commands and stepping ────────────────────────────────────────────────────────────────

  /** Validates now (for immediate UI feedback) and queues for the next tick. */
  enqueue(command: Command): CommandResult {
    if (this.state.status !== 'running') return { ok: false, reason: 'condition', message: 'The mission is over' };
    const result = validateCommand(this, command);
    if (result.ok) this.pending.push(structuredClone(command));
    return result;
  }

  /** Orders accepted but not yet applied (they apply at the next tick; useful while paused). */
  pendingCommands(): readonly Command[] {
    return this.pending;
  }

  /** Validation only, for hover feedback and context menus. */
  validate(command: Command): CommandResult {
    return validateCommand(this, command);
  }

  /** Advances one 50 ms tick and returns the events it produced. */
  step(): GameEvent[] {
    this.events = [];
    const s = this.state;
    if (s.status !== 'running') return this.events;
    s.tick += 1;
    const commands = this.pending;
    this.pending = [];
    for (const command of commands) applyCommand(this, command);
    updateDirector(this);
    updateOperatives(this);
    this.sight.smoke = s.smoke;
    updatePerception(this);
    updateGuards(this);
    updateWorldTimers(this);
    updateAlarm(this);
    updateObjectives(this);
    s.rng = this.rng.state;
    return this.events;
  }

  // ── UI queries (read-only) ───────────────────────────────────────────────────────────────

  previewPath(unitId: string, target: Vec2): PathResult | null {
    const op = this.operatives.get(unitId);
    return op ? this.pathfinder.findPath(op.pos, target, navProfileFor(op)) : null;
  }

  fanFor(guardId: string, rays = 41): VisibilityFan | null {
    const g = this.guards.get(guardId);
    if (!g || g.status !== 'active') return null;
    const params = visionParams(this, g);
    return visibilityFan(this.sight, g.pos, params.eyeY, g.facing + g.look, params.fov, params.far, params.near, rays);
  }
}
