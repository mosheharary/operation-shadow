/** USD per million tokens (input, output). Prices from docs/research/technology-landscape-2026-10.md. */
const PRICES: Record<string, { input: number; output: number }> = {
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  // Dossier sketches: image output tokens are priced far higher than text (conservative estimate).
  'gemini-3.1-flash-image': { input: 0.5, output: 60 },
};

/** Estimated cost of one call; unknown models are priced like the default model so budgets stay safe. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? PRICES['gemini-3.8-flash']!;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
