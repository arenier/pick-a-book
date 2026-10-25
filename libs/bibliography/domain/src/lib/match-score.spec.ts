import { describe, expect, it } from 'vitest';

import { MatchScore } from './match-score.js';

describe('MatchScore', () => {
  it.each([0, 0.5, 1])('accepts %s', (raw) => {
    expect(MatchScore.of(raw).ok).toBe(true);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (raw) => {
    expect(MatchScore.of(raw).ok).toBe(false);
  });

  it('brings a computed score back into [0, 1]', () => {
    expect(MatchScore.fromComputed(1.0000000000000002).value).toBe(1);
    expect(MatchScore.fromComputed(-0.2).value).toBe(0);
    expect(MatchScore.fromComputed(Number.NaN).value).toBe(0);
    expect(MatchScore.fromComputed(0.4).value).toBe(0.4);
  });
});
