import { clamp, distance, headingTo, turnToward, type Vec2 } from '../core/math';
import { TARGET_HEIGHT } from '../sight/los';
import { ABILITIES } from './abilities';
import { followPath } from './movement';
import { damageOperative } from './operatives';
import { bestSuspicion, guardCanSee, hasCover, THRESHOLD, visionParams } from './perception';
import { DIFFICULTY, GUARD_NAV, GUARD_SPEED, NOISE_DB } from './rules';
import type { BarkLine } from './events';
import { DT, type Guard, type GuardStateName, type Operative, type Stimulus, seconds } from './types';
import type { World } from './world';

const TURN_RATE = 4;
const FOCUS_TTL = seconds(8);

const calmState = (g: Guard): GuardStateName => (g.routeId ? 'patrol' : 'post');
const stateSeconds = (world: World, g: Guard) => (world.state.tick - g.stateSince) * DT;

function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return (h % 628) / 100;
}

export function setGuardState(world: World, g: Guard, next: GuardStateName): void {
  if (g.state === next) return;
  const from = g.state;
  g.state = next;
  g.stateSince = world.state.tick;
  g.path = null;
  g.pathIndex = 0;
  g.lookUntil = 0;
  g.barked = false;
  world.emit({ type: 'guard-state', guardId: g.id, from, to: next });
}

function bark(world: World, g: Guard, line: BarkLine, priority = 2): void {
  if (g.barked) return;
  g.barked = true;
  world.emit({ type: 'bark', speaker: g.id, line, priority });
}

function pathTo(world: World, g: Guard, pos: Vec2): boolean {
  const res = world.pathfinder.findPath(g.pos, pos, GUARD_NAV);
  if (!res.ok) {
    g.path = null;
    return false;
  }
  g.path = res.points;
  g.pathIndex = 1;
  return true;
}

/** Walks the current path; returns true when there is no path left. */
function walk(world: World, g: Guard, speed: number): boolean {
  if (!g.path) return true;
  const progress = followPath(world, g, g.path, g.pathIndex, 0, speed, g.id);
  g.pathIndex = progress.index;
  g.look = 0;
  if (progress.arrived) {
    g.path = null;
    return true;
  }
  return false;
}

function face(g: Guard, pos: Vec2): void {
  if (distance(g.pos, pos) < 0.05) return;
  g.facing = turnToward(g.facing, headingTo(g.pos, pos), TURN_RATE * DT);
  g.look = 0;
}

function lookAround(world: World, g: Guard): void {
  g.look = Math.sin(world.state.tick * DT * 1.7 + phaseOf(g.id)) * 1.0;
}

function freshFocus(world: World, g: Guard): Stimulus | null {
  return g.focus && world.state.tick - g.focus.tick <= FOCUS_TTL ? g.focus : null;
}

function setGoal(g: Guard, stimulus: Stimulus): void {
  g.goal = { ...stimulus.pos };
  g.goalKind = stimulus.kind;
  g.goalSource = stimulus.sourceId;
}

// ── Transitions ─────────────────────────────────────────────────────────────────────────────

function canChallenge(world: World, g: Guard, op: Operative): boolean {
  const s = world.state;
  if (g.temperament === 'strict' || g.temperament === 'aggressive') return false;
  if (s.alarm.persistent >= 3) return false;
  const busyHostile = op.action?.kind === 'channel' && ABILITIES[op.action.abilityId].suspicious;
  if (op.carrying || busyHostile || s.tick < op.suspiciousUntil) return false;
  if (op.lastMoveTick >= s.tick - 1 && op.lastGait === 'run') return false;
  return distance(g.pos, op.pos) <= visionParams(world, g).near * 1.3;
}

function onDetected(world: World, g: Guard, targetId: string, pos: Vec2): void {
  const s = world.state;
  if (g.targetId !== targetId || !['challenge', 'alerted', 'combat'].includes(g.state)) {
    s.stats.detections += 1;
    world.emit({ type: 'detected', guardId: g.id, targetId });
  }
  const spotted = world.operative(targetId);
  if (spotted) spotted.lastSpottedTick = s.tick;
  g.targetId = targetId;
  g.goal = { ...pos };
  g.focus = null;
  const op = world.operative(targetId);
  if (op && op.status === 'active' && canChallenge(world, g, op)) {
    setGuardState(world, g, 'challenge');
    bark(world, g, 'guard-halt', 3);
    world.noise(g.pos, NOISE_DB.shout, 'shout', g.id);
    g.challengeStillSince = op.lastMoveTick >= s.tick - 1 ? -1 : s.tick;
    g.aimUntil = s.tick + seconds(0.5);
    return;
  }
  goAlerted(world, g, targetId, pos, 'Intruder spotted');
}

function nearestBell(world: World, g: Guard) {
  let best: { id: string; pos: Vec2 } | null = null;
  let bestD = 45;
  for (const obj of world.state.objects) {
    if (obj.type !== 'alarm-bell' || obj.sabotaged || obj.destroyed || obj.sector !== g.sector) continue;
    const d = distance(obj.pos, g.pos);
    if (d < bestD) {
      best = obj;
      bestD = d;
    }
  }
  return best;
}

export function goAlerted(world: World, g: Guard, targetId: string | null, pos: Vec2, reason: string): void {
  setGuardState(world, g, 'alerted');
  g.targetId = targetId;
  g.goal = { ...pos };
  g.focus = null;
  g.alertness = 1;
  bark(world, g, 'guard-alarm', 3);
  world.noise(g.pos, NOISE_DB.shout, 'alarm-shout', g.id);
  world.raiseAlarm(3, reason, g.sector, pos);
  const bell = world.state.alarm.sirens ? null : nearestBell(world, g);
  g.bellId = bell?.id ?? null;
  if (bell) pathTo(world, g, bell.pos);
}

function startInvestigate(world: World, g: Guard, stimulus: Stimulus): void {
  setGuardState(world, g, 'investigate');
  setGoal(g, stimulus);
  g.focus = null;
  if (!pathTo(world, g, stimulus.pos)) g.lookUntil = world.state.tick + seconds(3);
  bark(world, g, 'guard-investigate');
}

function startSearch(world: World, g: Guard, center: Vec2): void {
  const s = world.state;
  setGuardState(world, g, 'search');
  g.goal = { ...center };
  const rules = DIFFICULTY[s.difficulty];
  const nodes = world.level.searchNodes
    .map((p, i) => ({ p, i, d: distance(p, center) }))
    .filter((n) => n.d <= 18)
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, 4)
    .map((n) => n.p);
  g.searchPoints = [{ ...center }, ...nodes];
  g.searchIndex = 0;
  g.searchUntil = s.tick + seconds(rules.searchSeconds * (s.alarm.persistent >= 3 ? 1.5 : 1));
}

function returnToRoutine(world: World, g: Guard): void {
  setGuardState(world, g, 'return');
  g.targetId = null;
  g.goal = null;
  g.alertness = Math.max(g.alertness, 0.3);
}

/** Escalation shared by calm and wary states. Returns true if the guard changed state. */
function escalate(world: World, g: Guard): boolean {
  const s = world.state;
  const best = bestSuspicion(g);
  const value = best?.value ?? 0;
  if (best && value >= THRESHOLD.detected) {
    onDetected(world, g, best.targetId, best.lastSeen);
    return true;
  }
  const focus = freshFocus(world, g);
  if (focus && focus.salience >= 95) {
    goAlerted(world, g, null, focus.pos, focus.noise === 'explosion' ? 'Explosion' : focus.noise === 'gunshot' ? 'Gunfire' : 'Alarm raised');
    return true;
  }
  if (best && value >= THRESHOLD.investigate && g.state !== 'investigate') {
    startInvestigate(world, g, { kind: 'sight', pos: best.lastSeen, tick: s.tick, salience: 75, sourceId: best.targetId });
    return true;
  }
  if (focus && (focus.kind === 'body' || focus.salience >= 50) && g.state !== 'investigate') {
    startInvestigate(world, g, focus);
    return true;
  }
  if (g.state === 'suspicious' || g.state === 'investigate') return false;
  if (best && value >= THRESHOLD.suspicious) {
    setGuardState(world, g, 'suspicious');
    g.goal = { ...best.lastSeen };
    g.goalKind = 'sight';
    return true;
  }
  if (g.state === 'observe') return false;
  if ((best && value >= THRESHOLD.observe) || (focus && focus.salience >= 25)) {
    setGuardState(world, g, 'observe');
    g.goal = best && value >= THRESHOLD.observe ? { ...best.lastSeen } : { ...focus!.pos };
    g.focus = null;
    return true;
  }
  return false;
}

// ── State behaviours ────────────────────────────────────────────────────────────────────────

function routine(world: World, g: Guard): void {
  const s = world.state;
  if (g.routeId) {
    const route = world.route(g.routeId);
    if (!route || route.points.length === 0) return;
    if (s.tick < g.waitUntil) {
      lookAround(world, g);
      return;
    }
    const index = g.routeIndex % route.points.length;
    if (!g.path && !pathTo(world, g, route.points[index]!)) {
      g.routeIndex = (index + 1) % route.points.length;
      return;
    }
    if (walk(world, g, s.alarm.level >= 3 ? GUARD_SPEED.walk : GUARD_SPEED.patrol)) {
      g.waitUntil = s.tick + seconds(route.waits[index] ?? 0);
      g.routeIndex = (index + 1) % route.points.length;
    }
    return;
  }
  if (distance(g.pos, g.home.pos) > 0.4) {
    if (!g.path) pathTo(world, g, g.home.pos);
    walk(world, g, GUARD_SPEED.patrol);
    return;
  }
  g.facing = turnToward(g.facing, g.home.facing, TURN_RATE * DT);
  const post = g.postId ? world.post(g.postId) : undefined;
  g.look = post?.sweepArc && post.sweepPeriod ? (Math.sin((s.tick * DT * Math.PI * 2) / post.sweepPeriod + phaseOf(g.id)) * post.sweepArc) / 2 : 0;
}

function updateObserve(world: World, g: Guard): void {
  if (escalate(world, g)) return;
  const best = bestSuspicion(g);
  const target = best && best.value >= THRESHOLD.observe ? best.lastSeen : g.goal;
  if (target) face(g, target);
  if (stateSeconds(world, g) > 3 && (best?.value ?? 0) < 10) {
    g.alertness = Math.min(1, g.alertness + 0.1);
    setGuardState(world, g, calmState(g));
  }
}

function updateSuspicious(world: World, g: Guard): void {
  if (escalate(world, g)) return;
  bark(world, g, 'guard-suspicious');
  const best = bestSuspicion(g);
  const target = best && best.value >= THRESHOLD.observe ? best.lastSeen : g.goal;
  if (target) {
    if (!g.path && stateSeconds(world, g) < 0.2) {
      const d = distance(g.pos, target);
      const step = Math.min(3, Math.max(0, d - 1.5));
      if (step > 0.5) {
        const t = step / d;
        pathTo(world, g, { x: g.pos.x + (target.x - g.pos.x) * t, z: g.pos.z + (target.z - g.pos.z) * t });
      }
    }
    if (walk(world, g, 1.0)) face(g, target);
  }
  if (stateSeconds(world, g) > 6 && (best?.value ?? 0) < 30) {
    g.alertness = Math.min(1, g.alertness + 0.2);
    bark(world, g, 'guard-all-clear', 1);
    returnToRoutine(world, g);
  }
}

function handleBody(world: World, g: Guard, body: Guard): void {
  if (body.found) return;
  body.found = true;
  world.state.stats.bodiesFound += 1;
  g.barked = false;
  bark(world, g, 'guard-found-body', 3);
  if (body.status === 'dead') {
    goAlerted(world, g, null, body.pos, 'Body found');
    return;
  }
  setGuardState(world, g, 'revive');
  g.goalSource = body.id;
  g.goal = { ...body.pos };
  world.raiseAlarm(body.status === 'restrained' ? 3 : 2, 'Unconscious soldier found', g.sector, body.pos);
}

function updateInvestigate(world: World, g: Guard): void {
  const s = world.state;
  if (escalate(world, g)) return;
  const focus = freshFocus(world, g);
  if (focus && g.goal && distance(focus.pos, g.goal) > 3 && (focus.kind === 'body' || focus.salience >= 50)) {
    setGoal(g, focus);
    g.focus = null;
    pathTo(world, g, g.goal);
  }
  if (g.goalKind === 'body' && g.goalSource) {
    const body = world.guard(g.goalSource);
    if (body && distance(g.pos, body.pos) <= 2.2 && body.status !== 'active') {
      handleBody(world, g, body);
      if (g.state !== 'investigate') return;
    }
  }
  if (!walk(world, g, GUARD_SPEED.walk)) return;
  if (g.lookUntil === 0) g.lookUntil = s.tick + seconds(3);
  lookAround(world, g);
  if (s.tick < g.lookUntil) return;
  const wary = s.alarm.level >= 2 || g.alertness >= 0.5 || g.goalKind === 'tracks';
  if (wary && g.goal) startSearch(world, g, g.goal);
  else returnToRoutine(world, g);
}

function updateSearch(world: World, g: Guard): void {
  const s = world.state;
  if (escalate(world, g)) return;
  if (s.tick > g.searchUntil || g.searchIndex >= g.searchPoints.length) {
    g.alertness = Math.max(g.alertness, 0.6);
    bark(world, g, 'guard-all-clear', 1);
    returnToRoutine(world, g);
    return;
  }
  const point = g.searchPoints[g.searchIndex]!;
  if (!g.path && g.lookUntil === 0 && distance(g.pos, point) > 0.6 && !pathTo(world, g, point)) {
    g.searchIndex += 1;
    return;
  }
  if (!walk(world, g, GUARD_SPEED.walk)) return;
  if (g.lookUntil === 0) g.lookUntil = s.tick + seconds(2);
  lookAround(world, g);
  if (s.tick >= g.lookUntil) {
    g.searchIndex += 1;
    g.lookUntil = 0;
  }
}

function updateReturn(world: World, g: Guard): void {
  if (escalate(world, g)) return;
  if (!g.path) {
    let target = g.home.pos;
    if (g.routeId) {
      const route = world.route(g.routeId);
      if (route && route.points.length > 0) {
        let best = 0;
        route.points.forEach((p, i) => {
          if (distance(p, g.pos) < distance(route.points[best]!, g.pos)) best = i;
        });
        g.routeIndex = best;
        target = route.points[best]!;
      }
    }
    if (distance(g.pos, target) < 0.5 || !pathTo(world, g, target)) {
      setGuardState(world, g, calmState(g));
      return;
    }
  }
  if (walk(world, g, GUARD_SPEED.patrol)) setGuardState(world, g, calmState(g));
}

function radioNetworkUp(world: World): boolean {
  const radios = world.state.objects.filter((o) => o.type === 'radio');
  return radios.length === 0 || radios.some((r) => r.type === 'radio' && !r.sabotaged && !r.destroyed);
}

function targetVisible(world: World, g: Guard, op: Operative): boolean {
  const params = visionParams(world, g);
  return guardCanSee(world, g, op.pos, TARGET_HEIGHT[op.stance], { ...params, far: params.far * 1.3, fov: Math.PI * 1.2 }).visible;
}

function updateAlerted(world: World, g: Guard): void {
  const s = world.state;
  const op = g.targetId ? world.operative(g.targetId) : undefined;
  if (op && op.status === 'active' && targetVisible(world, g, op)) {
    setGuardState(world, g, 'combat');
    g.aimUntil = s.tick + seconds(DIFFICULTY[s.difficulty].aimSeconds);
    g.lostSightTick = s.tick;
    return;
  }
  if (g.bellId) {
    const bell = world.object(g.bellId);
    if (!bell || bell.type !== 'alarm-bell' || bell.sabotaged || bell.destroyed) {
      g.bellId = null;
    } else if (distance(g.pos, bell.pos) <= 1.6 || walk(world, g, GUARD_SPEED.run)) {
      g.bellId = null;
      world.emit({ type: 'bell', objectId: bell.id, pos: { ...bell.pos } });
      world.raiseAlarm(radioNetworkUp(world) ? 4 : 3, 'Alarm bell rung', g.sector, bell.pos);
      startSearch(world, g, g.goal ?? g.pos);
    }
    return;
  }
  if (stateSeconds(world, g) > 1) startSearch(world, g, g.goal ?? g.pos);
}

function shoot(world: World, g: Guard, op: Operative): void {
  const s = world.state;
  const rules = DIFFICULTY[s.difficulty];
  const d = distance(g.pos, op.pos);
  let chance = rules.guardHitChance * clamp(1 - d / 50, 0.2, 1);
  if (op.stance === 'crouch') chance *= 0.8;
  else if (op.stance === 'prone') chance *= 0.55;
  if (op.lastMoveTick >= s.tick - 1 && op.lastGait === 'run') chance *= 0.75;
  const hit = world.rng.chance(chance);
  world.noise(g.pos, NOISE_DB.gunshot, 'gunshot', g.id);
  world.emit({ type: 'shot', shooterId: g.id, targetId: op.id, hit, weapon: 'rifle', from: { ...g.pos }, to: { ...op.pos } });
  if (hit) damageOperative(world, op, world.rng.int(rules.guardDamage[0], rules.guardDamage[1] + 1), 'enemy fire');
  g.nextShotTick = s.tick + seconds(1.2) + world.rng.int(0, 9);
}

function updateCombat(world: World, g: Guard): void {
  const s = world.state;
  let op = g.targetId ? world.operative(g.targetId) : undefined;
  if (!op || op.status !== 'active') {
    // Switch to another operative this guard has positively identified, if any is in view.
    op = s.operatives.find(
      (o) => o.status === 'active' && (g.suspicion.find((e) => e.targetId === o.id)?.value ?? 0) >= THRESHOLD.detected && targetVisible(world, g, o),
    );
    if (!op) {
      startSearch(world, g, g.goal ?? g.pos);
      return;
    }
    g.targetId = op.id;
  }
  if (targetVisible(world, g, op)) {
    face(g, op.pos);
    g.goal = { ...op.pos };
    g.lostSightTick = s.tick;
    g.path = null;
    if (s.tick >= g.aimUntil && s.tick >= g.nextShotTick) shoot(world, g, op);
    return;
  }
  if ((s.tick - g.lostSightTick) * DT > 4) {
    startSearch(world, g, g.goal ?? g.pos);
    return;
  }
  if (!g.path && g.goal) pathTo(world, g, g.goal);
  walk(world, g, GUARD_SPEED.run);
}

function capture(world: World, g: Guard, op: Operative): void {
  op.status = 'captured';
  op.escortedBy = g.id;
  op.action = null;
  op.queue = [];
  if (op.carrying) world.dropCarried(op);
  op.disguised = false;
  op.stance = 'stand';
  world.state.stats.captures += 1;
  world.emit({ type: 'operative-status', unitId: op.id, status: 'captured' });
  world.log('danger', `${op.role} has been captured. Free them from the holding area`);
  g.escorting = op.id;
  g.targetId = null;
  setGuardState(world, g, 'escort');
  world.raiseAlarm(2, 'Intruder captured', g.sector, op.pos);
  const holding = world.holdingPoint();
  if (holding) pathTo(world, g, holding);
}

function updateChallenge(world: World, g: Guard): void {
  const s = world.state;
  const op = g.targetId ? world.operative(g.targetId) : undefined;
  if (!op || op.status !== 'active') {
    returnToRoutine(world, g);
    return;
  }
  face(g, op.pos);
  const busyHostile = op.action?.kind === 'channel' && ABILITIES[op.action.abilityId].suspicious;
  const hostile = op.carrying !== null || busyHostile || s.tick < op.suspiciousUntil;
  const moved = op.lastMoveTick >= s.tick - 1;
  if (hostile || (moved && stateSeconds(world, g) > 0.6) || stateSeconds(world, g) > 6) {
    goAlerted(world, g, op.id, op.pos, 'Intruder resisted');
    return;
  }
  if (moved) {
    g.challengeStillSince = -1;
    return;
  }
  if (g.challengeStillSince < 0) g.challengeStillSince = s.tick;
  if ((s.tick - g.challengeStillSince) * DT >= 1.5) capture(world, g, op);
}

function updateEscort(world: World, g: Guard): void {
  const op = g.escorting ? world.operative(g.escorting) : undefined;
  if (!op || op.status !== 'captured') {
    g.escorting = null;
    returnToRoutine(world, g);
    return;
  }
  const arrived = walk(world, g, GUARD_SPEED.walk);
  op.pos = { x: g.pos.x - Math.cos(g.facing) * 0.9, z: g.pos.z - Math.sin(g.facing) * 0.9 };
  op.facing = g.facing;
  if (arrived) {
    const holding = world.holdingPoint();
    if (holding) op.pos = { ...holding };
    op.escortedBy = null;
    g.escorting = null;
    returnToRoutine(world, g);
  }
}

function updateRevive(world: World, g: Guard): void {
  const s = world.state;
  const body = g.goalSource ? world.guard(g.goalSource) : undefined;
  if (!body || body.status === 'active' || body.status === 'dead' || body.carriedBy || body.hiddenIn) {
    startSearch(world, g, g.goal ?? g.pos);
    return;
  }
  if (distance(g.pos, body.pos) > 1.3) {
    if (!g.path) pathTo(world, g, body.pos);
    walk(world, g, GUARD_SPEED.walk);
    return;
  }
  face(g, body.pos);
  if (g.lookUntil === 0) g.lookUntil = s.tick + seconds(body.status === 'restrained' ? 4 : 3);
  if (s.tick >= g.lookUntil) {
    wakeGuard(world, body);
    startSearch(world, g, body.pos);
  }
}

function updateDistracted(world: World, g: Guard): void {
  const s = world.state;
  const op = g.distractedBy ? world.operative(g.distractedBy) : undefined;
  if (!op || op.status !== 'active' || !hasCover(world, op) || distance(op.pos, g.pos) > 3 || s.tick >= g.distractedUntil) {
    endDistraction(world, g.id);
    return;
  }
  face(g, op.pos);
  const best = bestSuspicion(g);
  if (best && best.value >= THRESHOLD.detected) onDetected(world, g, best.targetId, best.lastSeen);
}

export function updateGuards(world: World): void {
  for (const g of world.state.guards) {
    if (g.status !== 'active') continue;
    switch (g.state) {
      case 'post':
      case 'patrol':
        if (!escalate(world, g)) routine(world, g);
        break;
      case 'observe':
        updateObserve(world, g);
        break;
      case 'suspicious':
        updateSuspicious(world, g);
        break;
      case 'investigate':
        updateInvestigate(world, g);
        break;
      case 'search':
        updateSearch(world, g);
        break;
      case 'return':
        updateReturn(world, g);
        break;
      case 'alerted':
        updateAlerted(world, g);
        break;
      case 'combat':
        updateCombat(world, g);
        break;
      case 'challenge':
        updateChallenge(world, g);
        break;
      case 'escort':
        updateEscort(world, g);
        break;
      case 'revive':
        updateRevive(world, g);
        break;
      case 'distracted':
        updateDistracted(world, g);
        break;
    }
  }
}

// ── Helpers used by abilities and timers ────────────────────────────────────────────────────

/** Sends a guard (e.g. a fresh reinforcement) to search around a point. */
export function dispatchToSearch(world: World, g: Guard, center: Vec2): void {
  g.alertness = 1;
  startSearch(world, g, center);
}

/** Sends an alarm reinforcement back to its barracks once the alarm stands down. */
export function sendToBarracks(world: World, g: Guard): void {
  if (!g.barracks) return;
  g.home = { pos: { ...g.barracks }, facing: g.home.facing };
  g.focus = null;
  g.suspicion = [];
  returnToRoutine(world, g);
}

export function disableGuard(world: World, g: Guard, status: 'ko' | 'dead'): void {
  const s = world.state;
  g.status = status;
  if (status === 'dead') g.health = 0;
  g.koUntil = status === 'ko' ? s.tick + seconds(DIFFICULTY[s.difficulty].koSeconds) : 0;
  g.path = null;
  g.found = false;
  g.targetId = null;
  g.focus = null;
  g.bellId = null;
  if (g.escorting) {
    const op = world.operative(g.escorting);
    if (op) op.escortedBy = null;
    g.escorting = null;
  }
  if (g.distractedBy) endDistraction(world, g.id);
  world.emit({ type: 'guard-status', guardId: g.id, status });
}

export function wakeGuard(world: World, g: Guard): void {
  if (g.status !== 'ko' && g.status !== 'restrained') return;
  if (g.carriedBy) {
    const carrier = world.operative(g.carriedBy);
    if (carrier) world.dropCarried(carrier);
  }
  if (g.hiddenIn) {
    const container = world.object(g.hiddenIn);
    if (container?.type === 'container') container.contents = container.contents.filter((id) => id !== g.id);
    g.hiddenIn = null;
  }
  g.status = 'active';
  g.found = true;
  g.suspicion = [];
  g.alertness = 1;
  world.emit({ type: 'guard-status', guardId: g.id, status: 'active' });
  world.log('warning', 'A soldier has come round');
  startSearch(world, g, g.pos);
  world.raiseAlarm(2, 'A soldier came round', g.sector, g.pos);
}

/** A guard who was shot at knows where the shooter is. */
export function alertGuardTo(world: World, g: Guard, targetId: string, pos: Vec2): void {
  const entry = g.suspicion.find((e) => e.targetId === targetId);
  if (entry) {
    entry.value = Math.max(entry.value, THRESHOLD.detected);
    entry.lastSeen = { ...pos };
    entry.lastSeenTick = world.state.tick;
  } else g.suspicion.push({ targetId, value: THRESHOLD.detected, lastSeen: { ...pos }, lastSeenTick: world.state.tick });
  goAlerted(world, g, targetId, pos, 'Under fire');
}

export function distractGuard(world: World, g: Guard, op: Operative, durationSeconds = 30): void {
  setGuardState(world, g, 'distracted');
  g.distractedBy = op.id;
  g.distractedUntil = world.state.tick + seconds(durationSeconds);
  g.path = null;
}

export function endDistraction(world: World, guardId: string): void {
  const g = world.guard(guardId);
  if (!g) return;
  const opId = g.distractedBy;
  g.distractedBy = null;
  if (g.state === 'distracted' && g.status === 'active') setGuardState(world, g, calmState(g));
  if (opId) {
    const op = world.operative(opId);
    if (op?.action?.kind === 'converse') op.action = null;
  }
}
