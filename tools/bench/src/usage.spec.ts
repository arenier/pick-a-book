import { describe, expect, it } from 'vitest';

import { estimateCost, readUsage } from './usage.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

describe('estimateCost', () => {
  it('trusts the provider-reported cost when it gave one', () => {
    expect(estimateCost('qwen', 5000, 500, 0.0012)).toBe(0.0012);
  });

  it('falls back to a token-price estimate when no cost was reported', () => {
    // gemini prices: 0.3 in, 2.5 out per million.
    expect(estimateCost('gemini', 1_000_000, 1_000_000, null)).toBeCloseTo(2.8, 10);
  });

  it('returns null for a provider without a price table', () => {
    expect(estimateCost('unknown', 1000, 1000, null)).toBeNull();
  });

  it('returns null rather than 0 when nothing was billed and nothing consumed', () => {
    expect(estimateCost('gemini', 0, 0, null)).toBeNull();
  });
});

describe('readUsage', () => {
  it("reads Gemini's usageMetadata", async () => {
    const usage = await readUsage(
      jsonResponse({ usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300 } }),
    );

    expect(usage).toStrictEqual({
      promptTokens: 1200,
      completionTokens: 300,
      reportedCostUsd: null,
    });
  });

  it('reads the OpenAI-shaped usage, cost included', async () => {
    const usage = await readUsage(
      jsonResponse({ usage: { prompt_tokens: 800, completion_tokens: 120, cost: 0.0009 } }),
    );

    expect(usage).toStrictEqual({
      promptTokens: 800,
      completionTokens: 120,
      reportedCostUsd: 0.0009,
    });
  });

  it('reports zeros for an envelope carrying no usage', async () => {
    const usage = await readUsage(jsonResponse({ choices: [] }));

    expect(usage).toStrictEqual({ promptTokens: 0, completionTokens: 0, reportedCostUsd: null });
  });

  it('reports zeros rather than throwing on a non-JSON body', async () => {
    const usage = await readUsage(new Response('not json at all'));

    expect(usage).toStrictEqual({ promptTokens: 0, completionTokens: 0, reportedCostUsd: null });
  });
});
