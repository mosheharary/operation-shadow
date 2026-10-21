import { Rng } from '../core/rng';
import type { LevelData } from '../level/types';
import { validateMission, type MissionValidationReport } from '../levelgen/validate';
import type { DeckCard, DirectorDeck, DirectorEventDef, GuardSpawn, MissionRuntime, ObjectiveDef, ObjectSpawn } from '../sim/mission';
import { SPECIALISTS, type SpecialistId, type Weather } from '../sim/types';
import { type GuardDensity, MISSION_SPEC_VERSION, type MissionSpec, OBJECTIVE_SLOT_TAG, type ObjectiveSpec, type TemplateDef } from './spec';

const DENSITY_PRIORITY: Record<GuardDensity, number> = { light: 1, standard: 2, heavy: 3 };
const WEATHERS: readonly Weather[] = ['clear', 'rain', 'fog', 'snow'];

/** Semantic checks a structurally valid spec must also pass before it is compiled. */
export function specIssues(spec: MissionSpec, template: TemplateDef): string[] {
  const issues: string[] = [];
  if (spec.version !== MISSION_SPEC_VERSION) issues.push(`unsupported spec version ${String(spec.version)}`);
  if (spec.templateId !== template.id) issues.push(`spec is for template ${spec.templateId}, not ${template.id}`);
  if (!spec.objectives.some((o) => o.required)) issues.push('at least one objective must be required');
  const ids = new Set<string>();
  const slots = new Set<string>();
  for (const o of spec.objectives) {
    if (ids.has(o.id)) issues.push(`duplicate objective id ${o.id}`);
    ids.add(o.id);
    const slot = template.slots.find((s) => s.id === o.slot);
    if (!slot) issues.push(`objective ${o.id}: unknown slot ${o.slot}`);
    else if (slot.tag !== OBJECTIVE_SLOT_TAG[o.kind]) issues.push(`objective ${o.id}: slot ${o.slot} does not support ${o.kind}`);
    if (slots.has(o.slot)) issues.push(`objective ${o.id}: slot ${o.slot} used twice`);
    slots.add(o.slot);
    if (o.required && o.revealAtSeconds !== undefined) issues.push(`objective ${o.id}: required objectives cannot start hidden`);
  }
  for (const e of spec.events) {
    if (e.trigger.type === 'objective' && !ids.has(e.trigger.objectiveId)) issues.push(`event ${e.id}: unknown objective ${e.trigger.objectiveId}`);
    if (e.action.type === 'reinforce' && !template.sectors.includes(e.action.sector)) issues.push(`event ${e.id}: unknown sector ${e.action.sector}`);
  }
  if (spec.squad.min < 1 || spec.squad.max > 6 || spec.squad.min > spec.squad.max) issues.push('squad size must be within 1–6');
  if (spec.squad.required.some((r) => !SPECIALISTS.includes(r))) issues.push('unknown required specialist');
  if (spec.squad.required.length > spec.squad.max) issues.push('more required specialists than squad places');
  return issues;
}

/**
 * Specialists the objectives themselves demand: only the Combat Engineer can sabotage, and
 * prisoners are held behind locked doors that only he can pick.
 */
export function impliedRoles(objectives: readonly ObjectiveSpec[]): SpecialistId[] {
  return objectives.some((o) => o.required && (o.kind === 'sabotage' || o.kind === 'rescue')) ? ['engineer'] : [];
}

export interface CompiledMission {
  level: LevelData;
  mission: MissionRuntime;
}

/** Turns a spec into a concrete level and runtime mission (deterministic for a given spec). */
export function compileMission(spec: MissionSpec, template: TemplateDef): CompiledMission {
  const issues = specIssues(spec, template);
  if (issues.length > 0) throw new Error(`Invalid mission spec: ${issues.join('; ')}`);
  const level = template.generate(spec.seed, spec.id);
  const slotPos = (id: string) => {
    const slot = level.slots.find((s) => s.id === `slot:${id}`);
    if (!slot) throw new Error(`Template ${template.id} level is missing slot ${id}`);
    return slot.pos;
  };

  const objects: ObjectSpawn[] = level.fixtures.map((f) => ({ ...f }));
  const objectives: ObjectiveDef[] = [];
  for (const o of spec.objectives) {
    const pos = slotPos(o.slot);
    const base = { id: `obj:${o.id}`, title: o.title, description: o.description, required: o.required, ...(o.revealAtSeconds !== undefined ? { hidden: true } : {}) };
    const sector = template.slots.find((s) => s.id === o.slot)!.sector;
    if (o.kind === 'sabotage') {
      objects.push({ type: 'objective-target', id: `target:${o.id}`, pos, label: o.title, sector });
      objectives.push({ ...base, kind: 'disable-target', targetId: `target:${o.id}` });
    } else if (o.kind === 'steal') {
      objects.push({ type: 'item', id: `item:${o.id}`, pos, item: 'codebook', amount: 1 });
      objectives.push({ ...base, kind: 'acquire-item', itemObjectId: `item:${o.id}` });
    } else {
      objects.push({ type: 'prisoner', id: `prisoner:${o.id}`, pos });
      objectives.push({ ...base, kind: 'rescue', prisonerId: `prisoner:${o.id}` });
    }
  }

  const limit = DENSITY_PRIORITY[spec.density];
  const guards: GuardSpawn[] = template.guards
    .filter((g) => g.priority <= limit)
    .map((g) => ({
      id: `g:${g.id}`,
      archetype: 'rifleman',
      rank: g.rank ?? 'soldier',
      temperament: g.temperament ?? 'standard',
      sector: g.sector,
      ...(g.post ? { postId: g.post } : {}),
      ...(g.route ? { routeId: g.route, ...(g.routeStart !== undefined ? { routeStart: g.routeStart } : {}) } : {}),
      ...(g.lantern ? { lantern: true } : {}),
      ...(g.radio ? { radio: true } : {}),
    }));

  const director: DirectorEventDef[] = [];
  for (const o of spec.objectives) {
    if (o.revealAtSeconds === undefined) continue;
    director.push({ id: `dir:reveal:${o.id}`, trigger: { type: 'time', seconds: o.revealAtSeconds }, actions: [{ type: 'reveal-objective', objectiveId: `obj:${o.id}` }] });
  }
  for (const e of spec.events) {
    const trigger = e.trigger.type === 'objective' ? { type: 'objective' as const, objectiveId: `obj:${e.trigger.objectiveId}` } : e.trigger;
    const action =
      e.action.type === 'message' ? { type: 'message' as const, speaker: 'LANTERN', lineKey: `${spec.id}-${e.id}`, text: e.action.text } : e.action;
    director.push({ id: `dir:${e.id}`, trigger, actions: [action] });
  }

  const requiredRoles = [...new Set([...spec.squad.required, ...impliedRoles(spec.objectives)])];
  const mission: MissionRuntime = {
    id: spec.id,
    title: spec.title,
    templateId: template.id,
    env: { ...spec.env },
    squadSpawns: level.slots.filter((s) => s.tags.includes('insertion')).map((s) => ({ pos: s.pos, facing: s.facing })),
    requiredRoles,
    squadSize: { min: Math.max(spec.squad.min, requiredRoles.length), max: spec.squad.max },
    guards,
    objects,
    objectives,
    extractionZoneId: template.extractionZoneId,
    holdingZoneId: template.holdingZoneId,
    director,
    failAtAlarm: spec.failAtAlarm,
    parSeconds: spec.parSeconds,
    reinforcementSpawns: template.reinforcements.map((r) => ({ ...r, pos: { ...r.pos } })),
    ...(spec.dynamicEvents ? { deck: deckFor(template) } : {}),
  };
  return { level, mission };
}

/** Compiles and runs the mission validator (reachability, stealth route, entity sanity). */
const DECK_WEATHER: Record<TemplateDef['theme'], Weather[]> = {
  coastal: ['fog', 'rain', 'clear'],
  alpine: ['snow', 'fog', 'clear'],
  rail: ['rain', 'fog', 'clear'],
  forest: ['fog', 'rain', 'clear'],
  farmland: ['rain', 'fog', 'clear'],
  training: [],
};

/** The template's dynamic-event deck: patrols from its reinforcement points, weather shifts, intel. */
export function deckFor(template: TemplateDef): DirectorDeck {
  return {
    firstAtSeconds: 150,
    intervalSeconds: [120, 200],
    cards: [
      ...template.reinforcements.map((r): DeckCard => ({ kind: 'patrol', sector: r.sector, pos: { ...r.pos }, count: Math.min(2, r.count) })),
      ...DECK_WEATHER[template.theme].map((weather): DeckCard => ({ kind: 'weather', weather })),
      { kind: 'intel', id: 'shifts', text: 'The garrison changes shifts on the hour. Fresh sentries look around more.' },
      { kind: 'intel', id: 'bodies', text: 'Bodies left in the open will be found. Hide them before you move on.' },
    ],
  };
}

export function compileAndValidate(spec: MissionSpec, template: TemplateDef): CompiledMission & { report: MissionValidationReport } {
  const compiled = compileMission(spec, template);
  return { ...compiled, report: validateMission(compiled.level, compiled.mission) };
}

/**
 * Deterministic "offline generator": a complete, valid spec for a template from a seed alone.
 * Used when AI is disabled or a model response fails validation.
 */
export function fallbackSpec(template: TemplateDef, seed: number, id: string): MissionSpec {
  const rng = Rng.fromSeed(seed ^ 0x0ff1ce);
  const pick = <T>(list: readonly T[]): T => list[rng.int(0, list.length)]!;
  const targets = template.slots.filter((s) => s.tag === 'objective-target');
  const items = template.slots.filter((s) => s.tag === 'item');
  const prisoners = template.slots.filter((s) => s.tag === 'prisoner');
  const primaryKind = targets.length > 0 && (prisoners.length === 0 || rng.chance(0.7)) ? 'sabotage' : 'rescue';
  const primarySlot = primaryKind === 'sabotage' ? pick(targets) : pick(prisoners);
  const objectives: ObjectiveSpec[] = [
    {
      id: 'primary',
      kind: primaryKind,
      slot: primarySlot.id,
      title: (primaryKind === 'sabotage' ? `Disable the ${primarySlot.label}` : `Free the prisoner held at the ${primarySlot.label}`).slice(0, 60),
      description:
        primaryKind === 'sabotage'
          ? `Sabotage the ${primarySlot.label} without raising the garrison.`
          : `A Coalition agent is held at the ${primarySlot.label}. Bring them back to the extraction point.`,
      required: true,
    },
  ];
  if (items.length > 0 && rng.chance(0.75)) {
    const slot = pick(items);
    objectives.push({ id: 'intel', kind: 'steal', slot: slot.id, title: `Recover papers from the ${slot.label}`.slice(0, 60), description: `Dominion orders are kept at the ${slot.label}.`, required: false });
  }
  if (primaryKind === 'sabotage' && prisoners.length > 0 && rng.chance(0.5)) {
    const slot = pick(prisoners);
    objectives.push({
      id: 'captive',
      kind: 'rescue',
      slot: slot.id,
      title: 'Free the captive',
      description: `HQ believes a partisan is held at the ${slot.label}.`,
      required: false,
      revealAtSeconds: 90 + rng.int(0, 90),
    });
  }
  const density: GuardDensity = pick(['light', 'standard', 'standard', 'heavy'] as const);
  const weather = rng.chance(0.5) ? template.defaults.weather : pick(WEATHERS.filter((w) => w !== 'snow' || template.theme === 'alpine'));
  return {
    version: MISSION_SPEC_VERSION,
    id,
    title: `${pick(['Grey', 'Silent', 'Hollow', 'Iron', 'Northern', 'Last', 'Broken'])} ${pick(['Lantern', 'Ember', 'Harbour', 'Ridge', 'Signal', 'Crossing', 'Tide'])}`,
    templateId: template.id,
    seed,
    env: { timeOfDay: rng.chance(0.6) ? 23 : template.defaults.timeOfDay, weather },
    density,
    objectives,
    squad: { required: impliedRoles(objectives), min: 2, max: 4 },
    failAtAlarm: null,
    parSeconds: template.defaults.parSeconds,
    events: [
      { id: 'landing', trigger: { type: 'time', seconds: 4 }, action: { type: 'message', text: `Lantern to Shadow Section. You are on the ground. ${objectives[0]!.title}, then get out unseen.` } },
      { id: 'done', trigger: { type: 'objective', objectiveId: 'primary' }, action: { type: 'message', text: 'Good work. Get back to the extraction point.' } },
      ...(template.reinforcements.length > 0
        ? [{ id: 'alarm', trigger: { type: 'alarm' as const, level: 3 as const }, action: { type: 'reinforce' as const, sector: pick(template.reinforcements).sector, count: 2 } }]
        : []),
    ],
  };
}
