import { describe, expect, it } from 'vitest';

import { aReading, aWork } from '../testing/builders.js';
import { matchBook } from './match-book.js';
import { MatchingSettings } from './matching-settings.js';

const settings = MatchingSettings.defaults();

const aswani = aWork('yacoubian', 'L’Immeuble Yacoubian', [], {
  authors: [{ name: 'Aswānī, ʿAlāʾ al-', role: 'main', authorityId: 'ark:/12148/cb-aswani' }],
});
const read = aReading('L’Immeuble Yacoubian', 'Alaa El Aswany');

describe('matchBook and the rejected forms of the authorities (research §5.4)', () => {
  it('asks for the authority of a record whose title matched and author did not', () => {
    const outcome = matchBook(read, [aswani], settings);

    expect(outcome.verdict).toBe('not_found');
    expect(
      outcome.needsAuthorityCheck.map((check) => [
        check.record.id.value,
        check.authorityIds.map((id) => id.value),
      ]),
    ).toStrictEqual([['ark:/12148/yacoubian', ['ark:/12148/cb-aswani']]]);
  });

  it('confirms once the rejected forms are given', () => {
    const forms = new Map([['ark:/12148/cb-aswani', ['Aswany, Alaa el-']]]);

    const outcome = matchBook(read, [aswani], settings, forms);

    expect(outcome.verdict).toBe('confirmed');
    expect(outcome.needsAuthorityCheck).toStrictEqual([]);
  });

  it('stops asking for an authority it already knows', () => {
    const forms = new Map([['ark:/12148/cb-aswani', ['Someone, Else']]]);

    const outcome = matchBook(read, [aswani], settings, forms);

    expect(outcome.verdict).toBe('not_found');
    expect(outcome.needsAuthorityCheck).toStrictEqual([]);
  });

  it('asks for nothing when the book is confirmed anyway', () => {
    const spelledAsRead = aWork('yacoubian-2', 'L’Immeuble Yacoubian', ['Aswany, Alaa el-']);

    const outcome = matchBook(read, [aswani, spelledAsRead], settings);

    expect(outcome.verdict).toBe('confirmed');
    expect(outcome.needsAuthorityCheck).toStrictEqual([]);
  });

  it('asks for nothing when a record has no authority to ask', () => {
    const peste = aWork('peste', 'La peste', ['Camus, Albert']);

    const outcome = matchBook(aReading('La Peste', 'Victor Hugo'), [peste], settings);

    expect(outcome.needsAuthorityCheck).toStrictEqual([]);
  });
});
