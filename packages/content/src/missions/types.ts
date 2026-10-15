import type { LevelData, MissionRuntime, MissionSpec, SpecialistId } from '@operation-shadow/engine';

export interface Briefing {
  codename: string;
  location: string;
  /** In-world time, e.g. "23:30". */
  time: string;
  weather: string;
  premise: string[];
  intel: string[];
  /** Restrictions and consequences, always stated explicitly. */
  warnings: string[];
  insertion: string;
  extraction: string;
  dossierImage: string;
  recommended: SpecialistId[];
}

export interface MissionEntry {
  key: string;
  title: string;
  theme: 'coastal' | 'alpine' | 'rail' | 'training';
  summary: string;
  /** Squad rules, known without building the level (must match the built mission). */
  squad: { required: SpecialistId[]; min: number; max: number };
  briefing: Briefing;
  debrief: { success: string; failure: string };
  build: () => { level: LevelData; mission: MissionRuntime };
  /** The data spec the mission compiles from (absent for the hand-placed Silent Tide). */
  spec?: MissionSpec;
  /** The guided tutorial (Boot Camp). */
  tutorial?: boolean;
}
