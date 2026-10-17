import manifest from '../../../public/media/models/manifest.json';

/** One processed model (see tools/media/models.ts). */
export interface ModelEntry {
  file: string;
  bytes: number;
  triangles: number;
  bounds: { min: number[]; max: number[] };
  source: string;
  name: string;
  url: string;
  authors: string[];
  license: string;
  /** Animation library only: clip length (s) and ground speed of the root-motion version (m/s). */
  clips?: Record<string, { duration: number; speed: number }>;
}

const MODELS: Record<string, ModelEntry> = manifest.models as Record<string, ModelEntry>;

export type ModelId = keyof typeof manifest.models;

export function hasModel(id: string): id is ModelId {
  return id in MODELS;
}

export function modelEntry(id: ModelId): ModelEntry {
  return MODELS[id]!;
}

/** Content-hashed URL of a processed model (cached immutably). */
export function modelUrl(id: ModelId): string {
  return `/media/models/${MODELS[id]!.file}`;
}

export function allModelIds(): ModelId[] {
  return Object.keys(MODELS) as ModelId[];
}
