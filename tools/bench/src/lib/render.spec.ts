import { describe, expect, it } from 'vitest';

import { renderReport } from './render.js';
import type { ProviderRun } from './render.js';

const run: ProviderRun = {
  provider: 'gemini',
  model: 'gemini-3.6-flash',
  photosScanned: 10,
  photosScored: 10,
  failures: 0,
  score: {
    truthCount: 100,
    detectedCount: 95,
    truePositives: 75,
    falsePositives: 20,
    falseNegatives: 25,
    correspondences: 90,
    authorGradable: 90,
    authorCorrect: 82,
    titleCorrect: 80,
    swapped: 1,
    highConfidenceHallucinations: 3,
    recall: 0.75,
    precision: 75 / 95,
    authorAccuracy: 82 / 90,
    titleAccuracy: 80 / 90,
  },
  medianLatencyMs: 4200,
  totalPromptTokens: 12000,
  totalCompletionTokens: 3000,
  estimatedCostUsd: 0.037,
};

describe('renderReport', () => {
  it('names every provider benched', () => {
    const markdown = renderReport([run, { ...run, provider: 'qwen', model: 'qwen3-vl' }]);

    expect(markdown).toContain('gemini');
    expect(markdown).toContain('qwen');
  });

  it('shows recall and precision as percentages', () => {
    const markdown = renderReport([run]);

    // Recall 0.75, then precision 75/95.
    expect(markdown).toContain('75.0%');
    expect(markdown).toContain('78.9%');
  });

  it('surfaces the metrics ADR 0005 watches: structuring errors and high-confidence hallucination', () => {
    const markdown = renderReport([run]);

    expect(markdown).toMatch(/swap|structur/iu);
    expect(markdown).toMatch(/hallucinat/iu);
  });

  it('reports an unknown cost as such rather than as zero', () => {
    const markdown = renderReport([{ ...run, estimatedCostUsd: null }]);

    expect(markdown).toContain('n/a');
  });

  it('notes when a run has no ground truth to score against', () => {
    const markdown = renderReport([{ ...run, photosScored: 0 }]);

    expect(markdown).toMatch(/ground truth|vérité/iu);
  });
});
