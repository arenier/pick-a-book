import { err, ok, type Result } from '@pick-a-book/shared-result';

import type { CascadeStep } from './cascade-step.js';
import { InvalidValue } from './invalid-value.error.js';

export interface MatchingSettingsValues {
  /** Below this similarity a title is not the title read (research §5.3). */
  readonly titleThreshold: number;
  readonly authorThreshold: number;
  /** The share of the title in the combined score of a record: the title is the identifier. */
  readonly titleWeight: number;
  /** A work is a candidate only within this distance of the best one. */
  readonly margin: number;
  readonly maxCandidates: number;
  /** How many records examined and not retained are kept for the analysis of errors. */
  readonly maxExamined: number;
  /** Weight of each step in the reconciliation score (research §5.8). */
  readonly stageWeights: Readonly<Record<CascadeStep, number>>;
  /** What a confirmation without any author read is worth, against one with an author. */
  readonly noAuthorFactor: number;
}

const DEFAULTS: MatchingSettingsValues = {
  titleThreshold: 0.85,
  authorThreshold: 0.85,
  titleWeight: 0.7,
  margin: 0.1,
  maxCandidates: 5,
  maxExamined: 3,
  stageWeights: { title_and_author: 1, author_only: 0.95, title_only: 0.9, segment: 0.85 },
  noAuthorFactor: 0.8,
};

/**
 * The settings of the matching rule, gathered in one validated object so that the bench can
 * move them without touching the rule (research §5). Initial values: the study of issue #20.
 */
export class MatchingSettings implements MatchingSettingsValues {
  private constructor(
    readonly titleThreshold: number,
    readonly authorThreshold: number,
    readonly titleWeight: number,
    readonly margin: number,
    readonly maxCandidates: number,
    readonly maxExamined: number,
    readonly stageWeights: Readonly<Record<CascadeStep, number>>,
    readonly noAuthorFactor: number,
  ) {}

  static defaults(): MatchingSettings {
    return new MatchingSettings(
      DEFAULTS.titleThreshold,
      DEFAULTS.authorThreshold,
      DEFAULTS.titleWeight,
      DEFAULTS.margin,
      DEFAULTS.maxCandidates,
      DEFAULTS.maxExamined,
      DEFAULTS.stageWeights,
      DEFAULTS.noAuthorFactor,
    );
  }

  static of(overrides: Partial<MatchingSettingsValues>): Result<MatchingSettings, InvalidValue> {
    const values = { ...DEFAULTS, ...overrides };

    const shares = [
      ['titleThreshold', values.titleThreshold],
      ['authorThreshold', values.authorThreshold],
      ['titleWeight', values.titleWeight],
      ['margin', values.margin],
      ['noAuthorFactor', values.noAuthorFactor],
      ...Object.entries(values.stageWeights).map(([step, weight]) => [
        `stageWeights.${step}`,
        weight,
      ]),
    ] as const;
    for (const [name, value] of shares) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        return err(new InvalidValue(`MatchingSettings: ${name} must be in [0, 1] (${value})`));
      }
    }
    for (const [name, value] of [
      ['maxCandidates', values.maxCandidates],
      ['maxExamined', values.maxExamined],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) {
        return err(
          new InvalidValue(`MatchingSettings: ${name} must be an integer >= 1 (${value})`),
        );
      }
    }

    return ok(
      new MatchingSettings(
        values.titleThreshold,
        values.authorThreshold,
        values.titleWeight,
        values.margin,
        values.maxCandidates,
        values.maxExamined,
        values.stageWeights,
        values.noAuthorFactor,
      ),
    );
  }
}
