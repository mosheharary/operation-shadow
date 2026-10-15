import {
  fallbackSpec,
  GENERATOR_TEMPLATES,
  getTemplate,
  impliedRoles,
  MISSION_SPEC_VERSION,
  OBJECTIVE_SLOT_TAG,
  Rng,
  type EventSpec,
  type MissionSpec,
  type ObjectiveSpec,
  type SpecialistId,
  type TemplateDef,
  type Weather,
} from '@operation-shadow/engine';
import { type GeneratedBriefing, type GenerationRequest, type MissionPlan, TIME_OF_DAY_HOURS } from '@operation-shadow/schemas';
import { textProblem } from './safety';

const THEME_OF: Record<string, TemplateDef['theme']> = Object.fromEntries(GENERATOR_TEMPLATES.map((t) => [t.id, t.theme]));

/** Templates the request allows. */
export function allowedTemplates(request: GenerationRequest): TemplateDef[] {
  return GENERATOR_TEMPLATES.filter((t) => request.theatre === 'any' || t.theme === request.theatre);
}

/**
 * The prompt. Only enumerated catalog data and the player's enumerated choices go in; the optional
 * codename is already restricted to letters, spaces, apostrophes and hyphens by the request schema.
 */
export function buildPrompt(request: GenerationRequest): string {
  const templates = allowedTemplates(request)
    .map((t) => {
      const slots = t.slots.map((s) => `    - slot "${s.id}" (${kindForTag(s.tag)}): ${s.label}`).join('\n');
      return `- templateId "${t.id}" — ${t.name}: ${t.description}\n  Objective slots:\n${slots}`;
    })
    .join('\n');
  const choices = [
    request.timeOfDay !== 'any' ? `timeOfDay must be "${request.timeOfDay}".` : 'Choose any timeOfDay.',
    request.weather !== 'any' ? `weather must be "${request.weather}".` : 'Choose any weather (snow only on the alpine template).',
    request.focus !== 'any' ? `At least one required objective must be of kind "${request.focus}".` : 'Choose the objective kinds freely.',
    request.codename ? `Use the codename "Operation ${request.codename}".` : 'Invent a two-word codename such as "Grey Lantern".',
  ].join('\n');
  return `You design one mission for "Operation Shadow", a top-down tactical stealth game in a fictional 1940s-style war.
Shadow Section, a six-specialist Coalition commando squad directed by their handler "Lantern", operates behind the lines of the Dominion, a fictional occupying power.
Specialists: infiltrator (MOTH: silent takedowns, climbing), recon (OWL: binoculars, darts), engineer (BADGER: lock-picking, wire cutters, sabotage, explosives), deception (FOX: disguises), medic (HERON: revives, sedatives), marine (OTTER: swimming, diving).
Never mention real countries, armies, political movements, historical people or symbols. No gore. Plain text only: no markup, links or emoji.

Pick exactly one template:
${templates}

Objective kinds: "sabotage" uses an objective-target slot, "steal" an item slot, "rescue" a prisoner slot. Use each slot at most once.
Give 1 to 3 objectives; at least one must be required. An optional objective may start hidden (revealAtSeconds 60-300); required objectives always have revealAtSeconds null.
density is how many guards are posted: light, standard or heavy. failOnFullAlarm true means the mission fails if the garrison reaches full alarm.
hqMessages are short radio lines from Lantern at a given second of the mission (0 to 3 of them).
recommended lists 1 to 4 specialist ids that suit the mission. The debrief lines congratulate or console the squad without inventing statistics.

Player choices:
${choices}

Answer with one JSON object that matches the schema.`;
}

function kindForTag(tag: string): string {
  return Object.entries(OBJECTIVE_SLOT_TAG).find(([, t]) => t === tag)?.[0] ?? tag;
}

/** Everything wrong with a schema-valid plan for this request (empty when it can be used). */
export function planIssues(plan: MissionPlan, request: GenerationRequest): string[] {
  const issues: string[] = [];
  const template = getTemplate(plan.templateId);
  if (!template || !allowedTemplates(request).some((t) => t.id === plan.templateId)) {
    issues.push(`templateId must be one of: ${allowedTemplates(request).map((t) => t.id).join(', ')}`);
  }
  if (request.timeOfDay !== 'any' && plan.timeOfDay !== request.timeOfDay) issues.push(`timeOfDay must be ${request.timeOfDay}`);
  if (request.weather !== 'any' && plan.weather !== request.weather) issues.push(`weather must be ${request.weather}`);
  if (plan.weather === 'snow' && THEME_OF[plan.templateId] !== 'alpine') issues.push('snow is only possible on the alpine template');
  if (!plan.objectives.some((o) => o.required)) issues.push('at least one objective must be required');
  if (request.focus !== 'any' && !plan.objectives.some((o) => o.required && o.kind === request.focus)) issues.push(`a required objective must be of kind ${request.focus}`);
  const used = new Set<string>();
  plan.objectives.forEach((o, i) => {
    const slot = template?.slots.find((s) => s.id === o.slot);
    if (template && !slot) issues.push(`objectives[${i}].slot "${o.slot}" does not exist on ${template.id}`);
    else if (slot && slot.tag !== OBJECTIVE_SLOT_TAG[o.kind]) issues.push(`objectives[${i}]: slot "${o.slot}" cannot be used for ${o.kind}`);
    if (used.has(o.slot)) issues.push(`objectives[${i}]: slot "${o.slot}" is used twice`);
    used.add(o.slot);
    if (o.required && o.revealAtSeconds !== null) issues.push(`objectives[${i}]: required objectives must have revealAtSeconds null`);
  });
  for (const [path, text] of planTexts(plan)) {
    const problem = textProblem(text);
    if (problem) issues.push(`${path} ${problem}`);
  }
  return issues;
}

function planTexts(plan: MissionPlan): [string, string][] {
  return [
    ['codename', plan.codename],
    ...plan.premise.map((t, i): [string, string] => [`premise[${i}]`, t]),
    ...plan.intel.map((t, i): [string, string] => [`intel[${i}]`, t]),
    ...plan.objectives.flatMap((o, i): [string, string][] => [
      [`objectives[${i}].title`, o.title],
      [`objectives[${i}].description`, o.description],
    ]),
    ...plan.hqMessages.map((m, i): [string, string] => [`hqMessages[${i}].text`, m.text]),
    ['debrief.success', plan.debrief.success],
    ['debrief.failure', plan.debrief.failure],
  ];
}

export interface BuiltMission {
  spec: MissionSpec;
  briefing: GeneratedBriefing;
}

const WEATHER_LABEL: Record<Weather, string> = { clear: 'Clear', rain: 'Rain', fog: 'Fog', snow: 'Snow' };
const hourLabel = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

function warningsFor(spec: MissionSpec): string[] {
  const warnings = ['Every surviving specialist must reach the extraction point to finish the mission.'];
  if (spec.failAtAlarm !== null) warnings.unshift('The mission fails if the garrison reaches full alarm.');
  if (spec.objectives.some((o) => o.revealAtSeconds !== undefined)) warnings.push('Lantern may send new orders during the operation.');
  return warnings;
}

function standardEvents(spec: Pick<MissionSpec, 'objectives'>, template: TemplateDef, rng: Rng): EventSpec[] {
  const primary = spec.objectives.find((o) => o.required)!;
  const events: EventSpec[] = [{ id: 'done', trigger: { type: 'objective', objectiveId: primary.id }, action: { type: 'message', text: 'Lantern here. Well done. Make for the extraction point.' } }];
  if (template.reinforcements.length > 0) {
    const pick = template.reinforcements[rng.int(0, template.reinforcements.length)]!;
    events.push({ id: 'reinforce', trigger: { type: 'alarm', level: 3 }, action: { type: 'reinforce', sector: pick.sector, count: 2 } });
  }
  return events;
}

/** Turns a validated plan into a mission spec and briefing. Coordinates come only from the template. */
export function planToMission(plan: MissionPlan, key: string, seed: number): BuiltMission {
  const template = getTemplate(plan.templateId);
  if (!template) throw new Error(`unknown template ${plan.templateId}`);
  const objectives: ObjectiveSpec[] = plan.objectives.map((o, i) => ({
    id: `o${i + 1}`,
    kind: o.kind,
    slot: o.slot,
    title: o.title,
    description: o.description,
    required: o.required,
    ...(!o.required && o.revealAtSeconds !== null ? { revealAtSeconds: o.revealAtSeconds } : {}),
  }));
  const rng = Rng.fromSeed(seed ^ 0x5eed);
  const required = impliedRoles(objectives);
  const spec: MissionSpec = {
    version: MISSION_SPEC_VERSION,
    id: key,
    title: plan.codename,
    templateId: template.id,
    seed,
    env: { timeOfDay: TIME_OF_DAY_HOURS[plan.timeOfDay], weather: plan.weather },
    density: plan.density,
    objectives,
    squad: { required, min: Math.max(2, required.length), max: 4 },
    failAtAlarm: plan.failOnFullAlarm ? 4 : null,
    parSeconds: template.defaults.parSeconds,
    events: [
      ...plan.hqMessages.map((m, i): EventSpec => ({ id: `hq-${i + 1}`, trigger: { type: 'time', seconds: m.atSeconds }, action: { type: 'message', text: m.text } })),
      ...standardEvents({ objectives }, template, rng),
    ],
    dynamicEvents: true,
  };
  return {
    spec,
    briefing: {
      codename: plan.codename.startsWith('Operation ') ? plan.codename : `Operation ${plan.codename}`,
      location: template.name,
      time: hourLabel(spec.env.timeOfDay),
      weather: WEATHER_LABEL[spec.env.weather],
      premise: plan.premise,
      intel: [...plan.intel, ...objectives.filter((o) => o.revealAtSeconds === undefined).map((o) => `${o.required ? 'Objective' : 'Optional'}: ${o.title}. ${o.description}`)],
      warnings: warningsFor(spec),
      insertion: 'Marked in green on your map.',
      extraction: 'The pick-up point marked in green on your map.',
      recommended: [...new Set<SpecialistId>([...required, ...plan.recommended])].slice(0, 4),
      debrief: plan.debrief,
    },
  };
}

/** The offline generator: a valid mission from the same request without any model. */
export function fallbackMission(request: GenerationRequest, key: string, seed: number): BuiltMission {
  const rng = Rng.fromSeed(seed ^ 0xfa11);
  const options = allowedTemplates(request);
  const template = options[rng.int(0, options.length)]!;
  const base = fallbackSpec(template, seed, key);
  const weather: Weather = request.weather === 'any' ? base.env.weather : request.weather === 'snow' && template.theme !== 'alpine' ? 'fog' : request.weather;
  const timeOfDay = request.timeOfDay === 'any' ? base.env.timeOfDay : TIME_OF_DAY_HOURS[request.timeOfDay];
  let objectives = base.objectives;
  // Honour a focus request by making the first matching slot the primary objective.
  if (request.focus !== 'any' && objectives[0]!.kind !== request.focus) {
    const slot = template.slots.find((s) => s.tag === OBJECTIVE_SLOT_TAG[request.focus as keyof typeof OBJECTIVE_SLOT_TAG]);
    if (slot) {
      const verb = { sabotage: 'Disable the', steal: 'Recover the papers from the', rescue: 'Free the prisoner at the' }[request.focus];
      objectives = [
        { id: 'primary', kind: request.focus, slot: slot.id, title: `${verb} ${slot.label}`.slice(0, 60), description: `Lantern needs this done before dawn. Keep the garrison quiet.`, required: true },
        ...objectives.slice(1).filter((o) => o.slot !== slot.id),
      ];
    }
  }
  const title = request.codename ?? base.title;
  const required = impliedRoles(objectives);
  const spec: MissionSpec = { ...base, title, env: { timeOfDay, weather }, objectives, squad: { required, min: Math.max(2, required.length), max: 4 }, dynamicEvents: true };
  spec.events = spec.events.filter((e) => e.trigger.type !== 'objective' || objectives.some((o) => e.trigger.type === 'objective' && o.id === e.trigger.objectiveId));
  return {
    spec,
    briefing: {
      codename: `Operation ${title}`,
      location: template.name,
      time: hourLabel(timeOfDay),
      weather: WEATHER_LABEL[weather],
      premise: [`Lantern has a job for Shadow Section at ${template.name}. ${template.description}`],
      intel: objectives.filter((o) => o.revealAtSeconds === undefined).map((o) => `${o.required ? 'Objective' : 'Optional'}: ${o.title}. ${o.description}`),
      warnings: warningsFor(spec),
      insertion: 'Marked in green on your map.',
      extraction: 'The pick-up point marked in green on your map.',
      recommended: [...new Set<SpecialistId>([...required, 'infiltrator', 'recon'])].slice(0, 4),
      debrief: { success: 'Clean work. Lantern logs another operation for Shadow Section.', failure: 'The operation is lost. Regroup and try again.' },
    },
  };
}

/** A plausible valid plan for a request, used by the mock provider and in tests. */
export function examplePlan(request: GenerationRequest, seed = 1): MissionPlan {
  const built = fallbackMission(request, 'op-example', seed);
  const template = getTemplate(built.spec.templateId)!;
  const timeOfDay = request.timeOfDay === 'any' ? 'night' : request.timeOfDay;
  return {
    codename: request.codename ?? 'Grey Lantern',
    templateId: template.id as MissionPlan['templateId'],
    timeOfDay,
    weather: built.spec.env.weather,
    density: 'standard',
    premise: ['A Dominion garrison guards something Lantern wants gone. Shadow Section goes in tonight, quietly.'],
    intel: ['Patrols change every few minutes. Watch the sentries before you move.'],
    objectives: built.spec.objectives.map((o) => ({ kind: o.kind, slot: o.slot, title: o.title, description: o.description, required: o.required, revealAtSeconds: o.revealAtSeconds ?? null })),
    hqMessages: [{ atSeconds: 5, text: 'Lantern to Shadow Section. You are on the ground. Good hunting.' }],
    failOnFullAlarm: false,
    recommended: ['infiltrator', 'engineer'],
    debrief: { success: 'Lantern is pleased. The garrison never knew you were there.', failure: 'The garrison was ready for you. We will try again.' },
  };
}
