import { getTemplate, type MissionSpec, type SpecialistId } from '@operation-shadow/engine';
import { specMission } from './campaign';
import type { MissionEntry } from './types';

/** A generated operation as stored by the server (validated with the shared schema before use). */
export interface GeneratedMissionData {
  key: string;
  source: 'gemini' | 'mock' | 'fallback';
  spec: MissionSpec;
  briefing: {
    codename: string;
    location: string;
    time: string;
    weather: string;
    premise: string[];
    intel: string[];
    warnings: string[];
    insertion: string;
    extraction: string;
    recommended: SpecialistId[];
    debrief: { success: string; failure: string };
    sceneDescription?: string;
  };
  /** The operation's own dossier sketch, if one was drawn. */
  dossierImage?: string;
}

// Stock sketches for operations drawn without AI (each AI-drafted operation gets its own).
const DOSSIER: Record<string, string> = {
  coastal: '/media/briefing/silent-tide.jpg',
  alpine: '/media/briefing/white-silence.jpg',
  rail: '/media/briefing/iron-junction.jpg',
  forest: '/media/briefing/frozen-ledger.jpg',
  farmland: '/media/briefing/boot-camp.jpg',
  training: '/media/briefing/boot-camp.jpg',
};

/** Turns a generated operation into a playable mission entry (same compile path as the campaign). */
export function generatedMissionEntry(data: GeneratedMissionData): MissionEntry | null {
  const template = getTemplate(data.spec.templateId);
  if (!template) return null;
  const { debrief, sceneDescription: _scene, ...briefing } = data.briefing;
  const origin = data.source === 'fallback' ? 'Prepared by the offline generator.' : 'Drafted by Lantern (AI-generated).';
  return {
    ...specMission(template, { ...data.spec, id: data.key }, {
      summary: `${briefing.premise[0] ?? template.description} ${origin}`,
      briefing: { ...briefing, dossierImage: data.dossierImage ?? DOSSIER[template.theme] ?? DOSSIER.coastal! },
      debrief,
    }),
    generated: data.source,
  };
}
