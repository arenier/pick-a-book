import { describe, expect, it } from 'vitest';

import { aRecord } from '../testing/builders.js';
import { recordTitleForms, titleScore } from './title-forms.js';

describe('recordTitleForms', () => {
  it('offers the title, the title with its complement and the forms cut before " : " or " / "', () => {
    const record = aRecord({ title: 'Exercices de style', titleComplement: 'nouvelle édition' });

    expect(recordTitleForms(record)).toStrictEqual([
      'Exercices de style',
      'Exercices de style : nouvelle édition',
    ]);
  });

  it('cuts a statement of responsibility the catalogue left in the title', () => {
    expect(recordTitleForms(aRecord({ title: 'La peste / Albert Camus' }))).toStrictEqual([
      'La peste / Albert Camus',
      'La peste',
    ]);
  });
});

describe('titleScore', () => {
  it.each([
    ['La Peste', 'La peste / Albert Camus', 1],
    ['La Peste', 'La peste', 1],
    ['LA PESTE', 'La peste', 1],
    ['L’Étranger', 'L’étranger', 1],
    ['Cuisine évasion', 'La Cuisine évasion', 1],
  ])('scores "%s" against "%s" at %s', (read, title, expected) => {
    expect(titleScore(read, aRecord({ title })).value).toBe(expected);
  });

  it('scores the title with its complement', () => {
    const record = aRecord({ title: 'Exercices de style', titleComplement: 'nouvelle édition' });

    expect(titleScore('Exercices de style nouvelle édition', record).value).toBe(1);
  });

  it('tolerates a letter lost in the reading', () => {
    expect(titleScore('La Pest', aRecord({ title: 'La peste' })).value).toBeGreaterThanOrEqual(
      0.85,
    );
  });

  it('keeps two different titles apart', () => {
    expect(titleScore('Les Choses', aRecord({ title: 'La Place' })).value).toBeLessThan(0.85);
    expect(titleScore('La Peste', aRecord({ title: 'La Chute' })).value).toBeLessThan(0.85);
  });

  // « 17 lunes » and « 18 lunes » are two works: a number tells two titles apart.
  it('never takes a title with another number for the same title', () => {
    expect(titleScore('17 lunes', aRecord({ title: '18 lunes' })).value).toBe(0);
    expect(titleScore('17 lunes', aRecord({ title: '17 lunes' })).value).toBe(1);
  });

  it('does not match a title with a number to one without', () => {
    expect(titleScore('Apollo', aRecord({ title: 'Apollo 13' })).value).toBe(0);
  });
});
