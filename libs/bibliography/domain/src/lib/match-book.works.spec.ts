import { describe, expect, it } from 'vitest';

import { aReading, aWork } from '../testing/builders.js';
import { candidatesOf, confirmedOf, idsOf } from '../testing/outcomes.js';
import { matchBook } from './match-book.js';
import { MatchingSettings } from './matching-settings.js';

const settings = MatchingSettings.defaults();

describe('matchBook, editions of one work (FR-007)', () => {
  it('does not call several editions ambiguous', () => {
    const folio = aWork('qr-folio', 'Exercices de style', ['Queneau, Raymond']);
    const poche = aWork('qr-poche', 'Exercices de style', ['Queneau, Raymond'], {
      titleComplement: 'nouvelle édition',
    });

    const outcome = matchBook(
      aReading('Exercices de style', 'Raymond Queneau'),
      [poche, folio],
      settings,
    );

    expect(outcome.verdict).toBe('confirmed');
  });

  it('does not group « 17 lunes » with « 18 lunes »', () => {
    const dixSept = aWork('lunes-17', '17 lunes', ['Auteur, Un']);
    const dixHuit = aWork('lunes-18', '18 lunes', ['Auteur, Un']);

    const outcome = matchBook(aReading('17 lunes', 'Un Auteur'), [dixHuit, dixSept], settings);

    expect(idsOf([confirmedOf(outcome)])).toStrictEqual(['ark:/12148/lunes-17']);
  });
});

describe('matchBook, the representative of a work (FR-020)', () => {
  it('prefers the record whose main authors are the ones read (FR-020)', () => {
    const roman = aWork('pavots-roman', 'Le Mystère des pavots blancs', ['Christie, Agatha']);
    // The adaptation comes first in the answer and has the smaller identifier.
    const bd = aWork('a-pavots-bd', 'Le Mystère des pavots blancs', [
      'Chandre, Alexandre',
      'Christie, Agatha',
    ]);

    const outcome = matchBook(
      aReading('Le Mystère des pavots blancs', 'Agatha Christie'),
      [bd, roman],
      settings,
    );

    expect(idsOf([confirmedOf(outcome)])).toStrictEqual(['ark:/12148/pavots-roman']);
  });

  it('groups a novel and its adaptation that share an author, even as a secondary one', () => {
    const novel = aWork('enola-roman', 'Le Mystère des pavots blancs', ['Springer, Nancy']);
    const bd = aWork('enola-bd', 'Le Mystère des pavots blancs', ['Blasco, Serena'], {
      authors: [
        { name: 'Blasco, Serena', role: 'main' },
        { name: 'Springer, Nancy', role: 'secondary' },
      ],
    });

    const outcome = matchBook(
      aReading('Le Mystère des pavots blancs', 'Nancy Springer'),
      [bd, novel],
      settings,
    );

    expect(idsOf([confirmedOf(outcome)])).toStrictEqual(['ark:/12148/enola-roman']);
  });

  it('picks the smallest identifier when nothing else tells two editions apart', () => {
    const b = aWork('b-ed', 'La peste', ['Camus, Albert']);
    const a = aWork('a-ed', 'La peste', ['Camus, Albert']);

    const outcome = matchBook(aReading('La Peste', 'Albert Camus'), [b, a], settings);

    expect(idsOf([confirmedOf(outcome)])).toStrictEqual(['ark:/12148/a-ed']);
  });
});

describe('matchBook, works within the margin', () => {
  it('leaves out a work whose score is too far from the best', () => {
    const close = aWork('close', 'Les Choses', ['Perec, Georges']);
    const far = aWork('far', 'Les Chosen', ['Perec, Georges']);

    // « Les Chosen » is 0.9 alike: within the title threshold, but 0.1 under the best.
    const outcome = matchBook(aReading('Les Choses'), [far, close], settings);

    expect(idsOf([confirmedOf(outcome)])).toStrictEqual(['ark:/12148/close']);
  });

  it('keeps at most 5 candidates, ranked 1 to n without a gap', () => {
    const families = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'];
    const records = families.map((family, index) =>
      aWork(`chute-${index}`, 'La chute', [`${family}, Zed`]),
    );

    const candidates = candidatesOf(matchBook(aReading('La Chute'), records, settings));

    expect(candidates.map((candidate) => candidate.rank)).toStrictEqual([1, 2, 3, 4, 5]);
    expect(candidates.every((candidate) => candidate.retained)).toBe(true);
  });
});
