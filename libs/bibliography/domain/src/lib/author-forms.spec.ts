import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aRecord } from '../testing/builders.js';
import { authorScore, readAuthorScore } from './author-forms.js';
import { ReadBook } from './read-book.js';

const camus = aRecord({
  authors: [{ name: 'Camus, Albert (1913-1960)', role: 'main' }],
});

describe('authorScore', () => {
  it.each(['Albert Camus', 'Camus Albert', 'Camus, Albert', 'ALBERT CAMUS'])(
    'matches "%s" to a name in either order',
    (name) => {
      expect(authorScore(name, camus).value).toBe(1);
    },
  );

  it('ignores the dates the catalogue puts in parentheses', () => {
    expect(authorScore('Albert Camus (1913-1960)', camus).value).toBe(1);
  });

  it('matches the family name alone', () => {
    expect(authorScore('Camus', camus).value).toBe(1);
  });

  it('matches an abbreviated first name', () => {
    expect(authorScore('A. Camus', camus).value).toBe(1);
    expect(authorScore('A Camus', camus).value).toBe(1);
  });

  it('does not match an initial that is not the first name', () => {
    expect(authorScore('J. Camus', camus).value).toBeLessThan(0.85);
  });

  it('tolerates a letter lost in the reading', () => {
    expect(authorScore('Albert Camu', camus).value).toBeGreaterThanOrEqual(0.85);
  });

  it('keeps a clearly different author apart', () => {
    expect(authorScore('Victor Hugo', camus).value).toBeLessThan(0.85);
    expect(authorScore('Albert Cohen', camus).value).toBeLessThan(0.85);
  });

  it('reads every author of the record, secondary ones included', () => {
    const record = aRecord({
      authors: [
        { name: 'Pennac, Daniel', role: 'main' },
        { name: 'Ferrandez, Jacques', role: 'secondary' },
      ],
    });

    expect(authorScore('J. Ferrandez', record).value).toBe(1);
    expect(authorScore('D. Pennac', record).value).toBe(1);
  });

  it('scores a record without author at zero', () => {
    expect(authorScore('Albert Camus', aRecord({ authors: [] })).value).toBe(0);
  });
});

describe('authorScore, with the rejected forms of the authority', () => {
  const aswani = aRecord({
    title: 'L’Immeuble Yacoubian',
    authors: [{ name: 'Aswānī, ʿAlāʾ al-', role: 'main' }],
  });

  it('does not match a transliteration the catalogue writes otherwise', () => {
    expect(authorScore('Alaa El Aswany', aswani).value).toBeLessThan(0.85);
  });

  it('matches it once the authority gave the rejected form', () => {
    expect(authorScore('Alaa El Aswany', aswani, ['Aswany, Alaa el-']).value).toBe(1);
  });
});

describe('readAuthorScore', () => {
  const pennacAndFerrandez = aRecord({
    authors: [{ name: 'Pennac, Daniel', role: 'main' }],
  });

  it('is absent when no author was read', () => {
    const read = unwrap(ReadBook.of('La Peste'));

    expect(readAuthorScore(read, camus)).toBeUndefined();
  });

  it('takes the best of the names read', () => {
    const read = unwrap(ReadBook.of('Chaque fois', 'D. Pennac - J. Ferrandez'));

    expect(readAuthorScore(read, pennacAndFerrandez)?.value).toBe(1);
  });

  it('also compares the author as read, when it is not several names', () => {
    const read = unwrap(ReadBook.of('La Peste', 'Albert Camus'));

    expect(readAuthorScore(read, camus)?.value).toBe(1);
  });
});
