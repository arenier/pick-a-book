import type { CascadeStep } from './cascade-step.js';
import type { MatchOutcome } from './match-outcome.js';
import { MatchingSettings } from './matching-settings.js';
import { ReconciliationScore } from './reconciliation-score.js';

/**
 * How sure the book retained by an outcome is, in [0, 1] (research §5.8, FR-021):
 *
 * ```text
 * combined score of the retained record × weight of the step × (author read ? 1 : 0.8)
 * ```
 *
 * An ambiguous book carries the score of its best candidate shared between all candidates, and a
 * book that was not found retains nothing, hence 0. A pure function of the match: the reading
 * confidence of the recognition is not a parameter, and no other score is ever mixed in.
 */
export function reconciliationScore(
  outcome: MatchOutcome,
  step: CascadeStep | null,
  authorRead: boolean,
  settings: MatchingSettings = MatchingSettings.defaults(),
): ReconciliationScore {
  if (outcome.verdict === 'not_found' || step === null) {
    return ReconciliationScore.fromComputed(0);
  }

  const share =
    outcome.verdict === 'confirmed'
      ? outcome.retained.score.value
      : Math.max(0, ...outcome.candidates.map((candidate) => candidate.score.value)) /
        outcome.candidates.length;

  return ReconciliationScore.fromComputed(
    share * settings.stageWeights[step] * (authorRead ? 1 : settings.noAuthorFactor),
  );
}
