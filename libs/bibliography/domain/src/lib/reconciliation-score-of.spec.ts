import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { aConfirmed, aNotFound, anAmbiguous, aRecord, aScored } from '../testing/builders.js';
import type { CascadeStep } from './cascade-step.js';
import type { MatchOutcome } from './match-outcome.js';
import { MatchingSettings } from './matching-settings.js';
import { reconciliationScore } from './reconciliation-score-of.js';

const settings = MatchingSettings.defaults();

function confirmedWith(score: number): MatchOutcome {
  return {
    verdict: 'confirmed',
    retained: aScored(aRecord(), { score }),
    examined: [],
    needsAuthorityCheck: [],
  };
}

describe('reconciliationScore', () => {
  it('multiplies the combined score by the weight of the step', () => {
    expect(reconciliationScore(confirmedWith(1), 'title_and_author', true).value).toBe(1);
    expect(reconciliationScore(confirmedWith(1), 'author_only', true).value).toBe(0.95);
    expect(reconciliationScore(confirmedWith(1), 'title_only', true).value).toBe(0.9);
    expect(reconciliationScore(confirmedWith(0.9), 'segment', true).value).toBeCloseTo(0.765, 10);
  });

  // The title alone is the weakest proof of the safety net (ADR 0014, FR-021).
  it('scores a confirmation without an author read under the same one with an author', () => {
    const without = reconciliationScore(confirmedWith(1), 'title_only', false);
    const withAuthor = reconciliationScore(confirmedWith(1), 'title_only', true);

    expect(without.value).toBeLessThan(withAuthor.value);
    expect(without.value).toBeCloseTo(0.72, 10);
  });

  it('puts the title and author step above the segment step', () => {
    const byTitleAndAuthor = reconciliationScore(aConfirmed(), 'title_and_author', true);
    const bySegment = reconciliationScore(aConfirmed(), 'segment', true);

    expect(byTitleAndAuthor.value).toBeGreaterThan(bySegment.value);
  });

  it('shares the score of the best candidate between the candidates of an ambiguity', () => {
    const outcome = anAmbiguous([aRecord({ id: 'ark:/1' }), aRecord({ id: 'ark:/2' })]);

    expect(reconciliationScore(outcome, 'title_only', true).value).toBeCloseTo(0.45, 10);
  });

  it('scores nothing retained at zero', () => {
    expect(reconciliationScore(aNotFound(), null, true).value).toBe(0);
  });
});

describe('reconciliationScore bounds', () => {
  it('stays within [0, 1] with any settings', () => {
    const generous = unwrap(MatchingSettings.of({ noAuthorFactor: 1 }));
    const steps: readonly (CascadeStep | null)[] = [
      'title_and_author',
      'author_only',
      'title_only',
      'segment',
      null,
    ];

    for (const step of steps) {
      const value = reconciliationScore(confirmedWith(1), step, false, generous).value;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('reconciliationScore signature', () => {
  // FR-021: the reading confidence never enters the score — the signature has no room for it.
  it('takes the outcome, the step, whether an author was read, and the settings only', () => {
    expectTypeOf(reconciliationScore).parameters.toEqualTypeOf<
      [
        outcome: MatchOutcome,
        step: CascadeStep | null,
        authorRead: boolean,
        settings?: MatchingSettings,
      ]
    >();
    expect(settings.noAuthorFactor).toBe(0.8);
  });
});
