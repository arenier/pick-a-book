import { describe, expect, it } from 'vitest';

import { ReconciliationScore } from './reconciliation-score.js';

describe('ReconciliationScore', () => {
  it.each([0, 0.5, 1])('accepts %s', (raw) => {
    expect(ReconciliationScore.of(raw).ok).toBe(true);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (raw) => {
    expect(ReconciliationScore.of(raw).ok).toBe(false);
  });

  it('brings a computed score back into [0, 1]', () => {
    expect(ReconciliationScore.fromComputed(1.0000000000000002).value).toBe(1);
    expect(ReconciliationScore.fromComputed(-0.2).value).toBe(0);
    expect(ReconciliationScore.fromComputed(Number.NaN).value).toBe(0);
    expect(ReconciliationScore.fromComputed(0.4).value).toBe(0.4);
  });
});
