import { describe, expect, it } from 'vitest';

import { isWireSummary, toHistoryEntry } from './history-entry';

const aSummary = {
  id: '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b',
  createdAt: '2026-09-27T14:03:12.481Z',
  outcome: 'completed',
  bookCount: 12,
  hasThumbnail: true,
};

/** A summary as the API sends it, proven and converted — what the screen of the history reads. */
function entryOf(summary: unknown) {
  if (!isWireSummary(summary)) {
    throw new TypeError('not a summary');
  }

  return toHistoryEntry(summary);
}

// FR-005: four outcomes a user can tell apart. `pending` is « not started » to them.
describe('toHistoryEntry, the outcome', () => {
  it('says how many books a completed analysis found', () => {
    expect(entryOf(aSummary).outcome).toStrictEqual({ kind: 'books', count: 12 });
  });

  it('says « none » for a completed analysis that found no book', () => {
    expect(entryOf({ ...aSummary, bookCount: 0 }).outcome).toStrictEqual({ kind: 'none' });
  });

  it('says « failed » for an analysis that failed', () => {
    const failed = {
      id: aSummary.id,
      createdAt: aSummary.createdAt,
      outcome: 'failed',
      hasThumbnail: false,
    };

    expect(entryOf(failed).outcome).toStrictEqual({ kind: 'failed' });
  });

  it('says « not started » for a photo that was never analysed', () => {
    const pending = {
      id: aSummary.id,
      createdAt: aSummary.createdAt,
      outcome: 'pending',
      hasThumbnail: false,
    };

    expect(entryOf(pending).outcome).toStrictEqual({ kind: 'notStarted' });
  });
});

describe('toHistoryEntry, the rest', () => {
  it('reads the date of the upload as a date, and keeps the id and the thumbnail', () => {
    expect(entryOf(aSummary)).toStrictEqual({
      id: aSummary.id,
      sentAt: new Date('2026-09-27T14:03:12.481Z'),
      outcome: { kind: 'books', count: 12 },
      hasThumbnail: true,
    });
  });
});

// The JSON of a response is `unknown` until proven otherwise (typescript.md): a body that does not
// have the shape of the contract is refused whole, never half-read.
describe('isWireSummary', () => {
  it('accepts a summary of the contract', () => {
    expect(isWireSummary(aSummary)).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'completed'],
    ['no id', { ...aSummary, id: undefined }],
    ['an id that is not a string', { ...aSummary, id: 12 }],
    ['a date that is not one', { ...aSummary, createdAt: 'yesterday' }],
    ['a date that is not a string', { ...aSummary, createdAt: 1_790_000_000_000 }],
    ['an unknown outcome', { ...aSummary, outcome: 'running' }],
    ['a completed analysis with no book count', { ...aSummary, bookCount: undefined }],
    ['a book count that is not a whole number', { ...aSummary, bookCount: 1.5 }],
    ['a negative book count', { ...aSummary, bookCount: -1 }],
    ['a thumbnail flag that is not a boolean', { ...aSummary, hasThumbnail: 'yes' }],
  ])('rejects %s', (_label, body) => {
    expect(isWireSummary(body)).toBe(false);
  });
});
