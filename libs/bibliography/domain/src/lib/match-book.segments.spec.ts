import { describe, expect, it } from 'vitest';

import { aReading, aWork } from '../testing/builders.js';
import { candidatesOf, confirmedOf, idsOf, isPartial } from '../testing/outcomes.js';
import { matchBook } from './match-book.js';
import { MatchingSettings } from './matching-settings.js';

const settings = MatchingSettings.defaults();

describe('matchBook, segments of a composed title (research §5.5)', () => {
  const percy = aWork('percy-2', 'La Mer des monstres', ['Riordan, Rick'], {
    context: { series: 'Percy Jackson', volume: 2 },
  });

  it('confirms when the other segments are explained by the record', () => {
    const read = aReading('Percy Jackson - La Mer des Monstres', 'Rick Riordan');

    expect(matchBook(read, [percy], settings).verdict).toBe('confirmed');
  });

  it('is ambiguous, never confirmed, when a segment is not explained', () => {
    const read = aReading('Les Aventures extraordinaires - La Mer des Monstres', 'Rick Riordan');

    const outcome = matchBook(read, [percy], settings);

    expect(isPartial(outcome)).toBe(true);
    expect(idsOf(candidatesOf(outcome))).toStrictEqual(['ark:/12148/percy-2']);
  });

  it('lets a collection or a publisher explain a segment', () => {
    const poche = aWork('poche', 'La Peste', ['Camus, Albert'], {
      context: { collection: 'Folio', publisher: 'Gallimard' },
    });

    const outcome = matchBook(aReading('La Peste - Folio', 'Albert Camus'), [poche], settings);

    expect(outcome.verdict).toBe('confirmed');
  });
});

describe('matchBook, series and volumes (FR-019)', () => {
  const series = aWork('eternels', 'Éternels', ['Auteur, Un']);
  const tome1 = aWork('eternels-1', 'Éternels', ['Auteur, Un'], {
    context: { series: 'Éternels', volume: 1 },
  });
  const tome3 = aWork('eternels-3', 'Éternels', ['Auteur, Un'], {
    context: { series: 'Éternels', volume: 3 },
  });

  it('retains the volume read and discards the others', () => {
    const read = aReading('Éternels (tome 3)', 'Un Auteur');

    const outcome = matchBook(read, [series, tome1, tome3], settings);

    expect(idsOf([confirmedOf(outcome)])).toStrictEqual(['ark:/12148/eternels-3']);
  });

  it('does not make the series alone a candidate next to its volumes', () => {
    const outcome = matchBook(aReading('Éternels', 'Un Auteur'), [series, tome1, tome3], settings);

    expect(idsOf(candidatesOf(outcome)).toSorted()).toStrictEqual([
      'ark:/12148/eternels-1',
      'ark:/12148/eternels-3',
    ]);
  });

  it('keeps the series when it is all there is', () => {
    const outcome = matchBook(aReading('Éternels', 'Un Auteur'), [series], settings);

    expect(outcome.verdict).toBe('confirmed');
  });
});
