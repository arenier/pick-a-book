import { describe, expect, it } from 'vitest';

import { aReading, aWork } from '../testing/builders.js';
import { candidatesOf, confirmedOf, idsOf } from '../testing/outcomes.js';
import { matchBook } from './match-book.js';
import { MatchingSettings } from './matching-settings.js';

const settings = MatchingSettings.defaults();
const peste = aWork('peste', 'La peste', ['Camus, Albert']);

describe('matchBook with an author read', () => {
  it('confirms an exact reading', () => {
    const outcome = matchBook(aReading('La Peste', 'Albert Camus'), [peste], settings);

    expect(idsOf([confirmedOf(outcome)])).toStrictEqual(['ark:/12148/peste']);
  });

  // FR-003: one or two letters mis-read do not change the book.
  it('confirms a reading with a letter lost', () => {
    const outcome = matchBook(aReading('La Pest', 'Albert Camus'), [peste], settings);

    expect(outcome.verdict).toBe('confirmed');
  });

  it('finds nothing when no title comes close (FR-004)', () => {
    const read = aReading('Titre peu lisible', 'Auteur peu lisible');

    expect(matchBook(read, [peste], settings).verdict).toBe('not_found');
  });

  it('finds nothing in an empty page', () => {
    expect(matchBook(aReading('La Peste', 'Albert Camus'), [], settings).verdict).toBe('not_found');
  });

  it('never confirms on a title alone when the author read contradicts it', () => {
    expect(matchBook(aReading('La Peste', 'Victor Hugo'), [peste], settings).verdict).toBe(
      'not_found',
    );
  });

  it('keeps the record whose author is the one read among several of the same title', () => {
    const place = aWork('place-ernaux', 'La place', ['Ernaux, Annie']);
    const placeOther = aWork('place-other', 'La place', ['Autre, Auteur']);

    const outcome = matchBook(aReading('La Place', 'Annie Ernaux'), [placeOther, place], settings);

    expect(idsOf([confirmedOf(outcome)])).toStrictEqual(['ark:/12148/place-ernaux']);
  });
});

describe('matchBook with an author read, scored and abbreviated', () => {
  it('combines the score: 0.7 of the title and 0.3 of the author', () => {
    const outcome = matchBook(aReading('La Pest', 'Albert Camus'), [peste], settings);

    const { titleScore, authorScore, score } = confirmedOf(outcome);
    expect(authorScore?.value).toBe(1);
    expect(score.value).toBeCloseTo(0.7 * titleScore.value + 0.3, 10);
  });

  it('matches an abbreviated author', () => {
    expect(matchBook(aReading('La Peste', 'A. Camus'), [peste], settings).verdict).toBe(
      'confirmed',
    );
  });

  it('compares each of several names read with every author of the record', () => {
    const bd = aWork('pavots-bd', 'Le Mystère des pavots blancs', [], {
      authors: [
        { name: 'Pennac, Daniel', role: 'main' },
        { name: 'Ferrandez, Jacques', role: 'secondary' },
      ],
    });
    const read = aReading('Le Mystère des pavots blancs', 'D. Pennac - J. Ferrandez');

    expect(matchBook(read, [bd], settings).verdict).toBe('confirmed');
  });
});

describe('matchBook without an author read (FR-005)', () => {
  it('confirms a title carried by a single work, on the title score alone', () => {
    const outcome = matchBook(aReading('La Peste'), [peste], settings);

    const retained = confirmedOf(outcome);
    expect(retained.authorScore).toBeUndefined();
    expect(retained.score.value).toBe(1);
  });

  it('is ambiguous when the title is carried by works of different authors', () => {
    const records = [
      aWork('chute-camus', 'La chute', ['Camus, Albert']),
      aWork('chute-other', 'La chute', ['Autre, Auteur']),
    ];

    const outcome = matchBook(aReading('La Chute'), records, settings);

    expect(outcome).toMatchObject({ verdict: 'ambiguous', partial: false });
    expect(idsOf(candidatesOf(outcome)).toSorted()).toStrictEqual([
      'ark:/12148/chute-camus',
      'ark:/12148/chute-other',
    ]);
  });
});
