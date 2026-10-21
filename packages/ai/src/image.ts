import { getTemplate } from '@operation-shadow/engine';
import type { BuiltMission } from './plan';
import { ProviderError } from './providers';

/** One drawn image and what it cost. */
export interface ImageCall {
  data: Buffer;
  mimeType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface DossierImageProvider {
  readonly model: string;
  /** Throws ProviderError on failure. */
  draw(prompt: string, signal?: AbortSignal): Promise<ImageCall>;
}

const GENERATE_URL = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface GeminiImageOptions {
  apiKey: string;
  model: string;
  /** One attempt only: the dossier falls back to the theatre's stock sketch on any failure. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function geminiImageProvider(options: GeminiImageOptions): DossierImageProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const redact = (text: string) => (options.apiKey ? text.split(options.apiKey).join('[redacted]') : text);
  return {
    model: options.model,
    async draw(prompt, signal) {
      const started = Date.now();
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 60_000);
      let res: Response;
      try {
        res = await doFetch(GENERATE_URL(options.model), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
          }),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (err) {
        throw new ProviderError(timeout.aborted ? 'The sketch was not drawn in time' : `Network error: ${redact((err as Error).message).slice(0, 120)}`, timeout.aborted ? 'timeout' : 'network');
      }
      const raw = await res.text();
      if (!res.ok) throw new ProviderError(`Image request failed (HTTP ${res.status})`, res.status === 429 ? 'rate-limited' : res.status >= 500 ? 'server' : 'rejected');
      let json: {
        candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      try {
        json = JSON.parse(raw) as typeof json;
      } catch {
        throw new ProviderError('The image response was not JSON', 'server');
      }
      const inline = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!inline?.data || !/^image\/(png|jpeg|webp)$/.test(inline.mimeType ?? '')) throw new ProviderError('No image came back', 'rejected');
      const data = Buffer.from(inline.data, 'base64');
      if (data.length > MAX_IMAGE_BYTES) throw new ProviderError('The image was too large', 'rejected');
      return {
        data,
        mimeType: inline.mimeType!,
        model: options.model,
        inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - started,
      };
    },
  };
}

/**
 * The picture for an operation's dossier, built from its validated plan: the scene the model
 * described (already checked as plain, safe text), the map, light, weather and main objective.
 */
export function dossierImagePrompt(mission: BuiltMission): string {
  const { spec, briefing } = mission;
  const template = getTemplate(spec.templateId);
  const primary = spec.objectives.find((o) => o.required) ?? spec.objectives[0];
  const hour = spec.env.timeOfDay;
  const light = hour < 8 ? 'first light, low cold sun' : hour < 17 ? 'flat daylight' : hour < 21 ? 'dusk, long shadows, last orange light' : 'night, moonlight and a few lamps';
  return [
    'Hand-drawn reconnaissance sketch pinned into a 1940s-style commando mission dossier: pencil and ink with a muted watercolour wash on aged, slightly stained paper. Wide landscape view.',
    briefing.sceneDescription ? `Scene: ${briefing.sceneDescription}` : '',
    template ? `Setting: ${template.name}. ${template.description}` : '',
    `Light: ${light}. Weather: ${spec.env.weather}.`,
    primary ? `The sketch draws the eye to what the mission is about: ${primary.title}.` : '',
    'Fictional setting. No readable text of any kind: no words, letters, numbers, captions, labels, arrows with notes, stamps or file numbers anywhere in the picture. No flags, insignia, emblems or symbols of any real country, army or movement. No close-up people; at most tiny distant sentries.',
  ]
    .filter(Boolean)
    .join('\n');
}
