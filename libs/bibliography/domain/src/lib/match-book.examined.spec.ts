import { describe, expect, it } from 'vitest';

import { aReading, aWork } from '../testing/builders.js';
import { idsOf } from '../testing/outcomes.js';
import { matchBook } from './match-book.js';
import { MatchingSettings } from './matching-settings.js';

const settings = MatchingSettings.defaults();
const peste = aWork('peste', 'La peste', ['Camus, Albert']);
const other = (id: string, title: string) => aWork(id, title, ['Autre, Auteur']);

// research §9: what was set aside is kept, to understand where the system goes wrong.
describe('matchBook, the records examined and not retained', () => {
  it('is empty when every record was retained', () => {
    const outcome = matchBook(aReading('La Peste', 'Albert Camus'), [peste], settings);

    expect(outcome.examined).toStrictEqual([]);
  });

  it('holds the records set aside, never one that was retained', () => {
    const records = [peste, other('hugo', 'Les misérables'), other('zola', 'Germinal')];

    const outcome = matchBook(aReading('La Peste', 'Albert Camus'), records, settings);

    expect(outcome.verdict).toBe('confirmed');
    expect(idsOf(outcome.examined)).not.toContain('ark:/12148/peste');
    expect(outcome.examined.every((entry) => !entry.retained)).toBe(true);
    expect(outcome.examined).toHaveLength(2);
  });

  it('keeps the best of the unknown book, with its score, for a book not found', () => {
    const outcome = matchBook(aReading('Titre peu lisible'), [peste], settings);

    expect(outcome.verdict).toBe('not_found');
    expect(idsOf(outcome.examined)).toStrictEqual(['ark:/12148/peste']);
    expect(outcome.examined[0]?.rank).toBe(1);
  });

  it('keeps three at most, the best scored first, ranked after the retained ones', () => {
    const records = [
      peste,
      other('a', 'Les misérables'),
      other('b', 'La pesanteur'),
      other('c', 'Germinal'),
      other('d', 'Nana'),
      other('e', 'La Pestilence'),
    ];

    const outcome = matchBook(aReading('La Peste', 'Albert Camus'), records, settings);

    expect(outcome.examined).toHaveLength(3);
    const scores = outcome.examined.map((entry) => entry.score.value);
    expect(scores).toStrictEqual(scores.toSorted((left, right) => right - left));
    expect(outcome.examined.map((entry) => entry.rank)).toStrictEqual([2, 3, 4]);
  });

  it('is present for an ambiguous verdict as well', () => {
    const records = [
      aWork('a', 'La chute', ['Camus, Albert']),
      aWork('b', 'La chute', ['Moreau, Julie']),
      other('c', 'Germinal'),
    ];

    const outcome = matchBook(aReading('La Chute'), records, settings);

    expect(outcome.verdict).toBe('ambiguous');
    expect(idsOf(outcome.examined)).toStrictEqual(['ark:/12148/c']);
  });
});
