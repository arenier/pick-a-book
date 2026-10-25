import { describe, expectTypeOf, it } from 'vitest';

import type { MatchOutcome, ScoredRecord } from './match-outcome.js';

describe('MatchOutcome', () => {
  // A verdict carries exactly what it needs: the type forbids asking a « not found » for its
  // retained record, or a « confirmed » for candidates.
  it('carries the retained record of a confirmed verdict only', () => {
    expectTypeOf<
      Extract<MatchOutcome, { verdict: 'confirmed' }>['retained']
    >().toEqualTypeOf<ScoredRecord>();
    expectTypeOf<Extract<MatchOutcome, { verdict: 'not_found' }>>().not.toHaveProperty('retained');
    expectTypeOf<Extract<MatchOutcome, { verdict: 'confirmed' }>>().not.toHaveProperty(
      'candidates',
    );
  });

  it('carries the candidates of an ambiguous verdict only', () => {
    expectTypeOf<Extract<MatchOutcome, { verdict: 'ambiguous' }>['candidates']>().toEqualTypeOf<
      readonly ScoredRecord[]
    >();
    expectTypeOf<
      Extract<MatchOutcome, { verdict: 'ambiguous' }>['partial']
    >().toEqualTypeOf<boolean>();
  });

  it('lists what was examined and what needs an authority check, whatever the verdict', () => {
    expectTypeOf<MatchOutcome['examined']>().toEqualTypeOf<readonly ScoredRecord[]>();
    expectTypeOf<MatchOutcome['needsAuthorityCheck']>().not.toBeNever();
  });
});
