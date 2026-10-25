import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { MatchingSettings } from './matching-settings.js';

describe('MatchingSettings', () => {
  // The values measured by the study of issue #20 (research §5).
  it('starts from the measured values', () => {
    const settings = MatchingSettings.defaults();

    expect(settings.titleThreshold).toBe(0.85);
    expect(settings.authorThreshold).toBe(0.85);
    expect(settings.titleWeight).toBe(0.7);
    expect(settings.margin).toBe(0.1);
    expect(settings.maxCandidates).toBe(5);
    expect(settings.maxExamined).toBe(3);
    expect(settings.stageWeights).toStrictEqual({
      title_and_author: 1,
      author_only: 0.95,
      title_only: 0.9,
      segment: 0.85,
    });
    expect(settings.noAuthorFactor).toBe(0.8);
  });

  it('lets the bench change a value without touching the others', () => {
    const settings = unwrap(MatchingSettings.of({ titleThreshold: 0.9 }));

    expect(settings.titleThreshold).toBe(0.9);
    expect(settings.margin).toBe(0.1);
  });

  it.each([
    { titleThreshold: 1.1 },
    { authorThreshold: -0.1 },
    { titleWeight: Number.NaN },
    { margin: 2 },
    { noAuthorFactor: -1 },
    { maxCandidates: 0 },
    { maxCandidates: 2.5 },
    { maxExamined: 0 },
    { stageWeights: { title_and_author: 1, author_only: 0.95, title_only: 0.9, segment: 1.5 } },
  ])('refuses %j', (values) => {
    expect(MatchingSettings.of(values).ok).toBe(false);
  });
});
