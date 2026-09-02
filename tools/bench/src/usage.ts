import { performance } from 'node:perf_hooks';

import { z } from 'zod';

/**
 * Instruments `fetch` so the bench can bill each scan: it times the call and reads token usage
 * off a clone of the response, leaving the body for the adapter. One scan is one call, so the
 * last recorded metrics are that scan's.
 */
export interface CallMetrics {
  readonly latencyMs: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly reportedCostUsd: number | null;
}

// Rough token prices, USD per million, so a run without a provider-reported cost still gets an
// estimate. Image tokens dominate and the catalogue moves, so the report labels this "estimé".
const PRICES: Partial<Record<string, { input: number; output: number }>> = {
  gemini: { input: 0.3, output: 2.5 },
  qwen: { input: 0.2, output: 0.6 },
};

const geminiUsageSchema = z.object({
  usageMetadata: z.object({
    promptTokenCount: z.number().optional(),
    candidatesTokenCount: z.number().optional(),
  }),
});

const openAiUsageSchema = z.object({
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    cost: z.number().optional(),
  }),
});

export function recordingTransport(): {
  transport: typeof fetch;
  last: () => CallMetrics | undefined;
} {
  let latest: CallMetrics | undefined;

  const transport: typeof fetch = async (input, init) => {
    const start = performance.now();
    const response = await fetch(input, init);
    const latencyMs = performance.now() - start;
    latest = { latencyMs, ...(await readUsage(response.clone())) };
    return response;
  };

  return { transport, last: () => latest };
}

/** Exported for its own tests: the two usage-payload shapes feed the decision-note costs. */
export async function readUsage(response: Response): Promise<Omit<CallMetrics, 'latencyMs'>> {
  const empty = { promptTokens: 0, completionTokens: 0, reportedCostUsd: null };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return empty;
  }

  const gemini = geminiUsageSchema.safeParse(body);
  if (gemini.success) {
    return {
      promptTokens: gemini.data.usageMetadata.promptTokenCount ?? 0,
      completionTokens: gemini.data.usageMetadata.candidatesTokenCount ?? 0,
      reportedCostUsd: null,
    };
  }

  const openai = openAiUsageSchema.safeParse(body);
  if (openai.success) {
    return {
      promptTokens: openai.data.usage.prompt_tokens ?? 0,
      completionTokens: openai.data.usage.completion_tokens ?? 0,
      reportedCostUsd: openai.data.usage.cost ?? null,
    };
  }

  return empty;
}

/** The provider's own billed amount when it gave one, otherwise a token-price estimate. */
export function estimateCost(
  provider: string,
  promptTokens: number,
  completionTokens: number,
  reportedCostUsd: number | null,
): number | null {
  if (reportedCostUsd !== null && reportedCostUsd > 0) {
    return reportedCostUsd;
  }
  const price = PRICES[provider];
  if (price === undefined || promptTokens + completionTokens === 0) {
    return null;
  }
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
}
