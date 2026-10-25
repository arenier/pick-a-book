import type { MatchOutcome, ScoredRecord } from '../lib/match-outcome.js';

/**
 * Reads of an outcome for the specs. They throw when the verdict is not the expected one, so a
 * spec states what it expects without a conditional of its own.
 */
export function confirmedOf(outcome: MatchOutcome): ScoredRecord {
  if (outcome.verdict !== 'confirmed') {
    throw new Error(`expected a confirmed verdict, got ${outcome.verdict}`);
  }
  return outcome.retained;
}

export function candidatesOf(outcome: MatchOutcome): readonly ScoredRecord[] {
  if (outcome.verdict !== 'ambiguous') {
    throw new Error(`expected an ambiguous verdict, got ${outcome.verdict}`);
  }
  return outcome.candidates;
}

export function isPartial(outcome: MatchOutcome): boolean {
  if (outcome.verdict !== 'ambiguous') {
    throw new Error(`expected an ambiguous verdict, got ${outcome.verdict}`);
  }
  return outcome.partial;
}

/** The identifiers of the records, in the order given. */
export function idsOf(scored: readonly ScoredRecord[]): readonly string[] {
  return scored.map((entry) => entry.record.id.value);
}
