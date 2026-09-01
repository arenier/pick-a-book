import { ShelfScanFailed } from '@pick-a-book/recognition-domain';
import { describe, expect, it } from 'vitest';

import { toDetectedBooks } from './shelf-scan-response.js';

/** Hoisted out of the tests: the rule set wants no closure that captures nothing. */
const reject = (raw: string) => () => toDetectedBooks(raw);

const wellFormed = {
  books: [
    { author: 'Marguerite Duras', title: "L'Amant", confidence: 0.94 },
    { author: 'Georges Perec', title: 'Les Choses', confidence: 0.62 },
  ],
};

describe('toDetectedBooks', () => {
  it('maps a well-formed payload onto the domain value objects', () => {
    const books = toDetectedBooks(JSON.stringify(wellFormed));

    expect(books).toHaveLength(2);
    expect(books[0]?.author.value).toBe('Marguerite Duras');
    expect(books[0]?.title.value).toBe("L'Amant");
    expect(books[0]?.confidence.value).toBe(0.94);
  });

  // A photo with no readable book is not an error (ADR 0005): it is an empty array.
  it('accepts an empty list rather than treating it as a failure', () => {
    expect(toDetectedBooks(JSON.stringify({ books: [] }))).toStrictEqual([]);
  });

  // Providers routinely wrap JSON in a markdown fence despite being asked not to. Tolerated
  // here because the payload itself is still verifiable — nothing is guessed.
  it('unwraps a fenced payload', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(wellFormed)}\n\`\`\``;

    expect(toDetectedBooks(fenced)).toHaveLength(2);
  });
});

describe('toDetectedBooks rejects off-contract answers with ShelfScanFailed', () => {
  it('when the payload is not JSON at all', () => {
    expect(reject('I could not read this shelf, sorry!')).toThrow(ShelfScanFailed);
  });

  it('when a field is missing', () => {
    expect(reject(JSON.stringify({ books: [{ author: 'Perec', confidence: 0.5 }] }))).toThrow(
      ShelfScanFailed,
    );
  });

  it('when confidence falls outside [0, 1]', () => {
    const outOfRange = { books: [{ author: 'Perec', title: 'Les Choses', confidence: 1.4 }] };

    expect(reject(JSON.stringify(outOfRange))).toThrow(ShelfScanFailed);
  });

  it('when a field holds the wrong type', () => {
    const wrongType = { books: [{ author: 'Perec', title: 'Les Choses', confidence: 'high' }] };

    expect(reject(JSON.stringify(wrongType))).toThrow(ShelfScanFailed);
  });

  // The domain refuses an empty author; the failure has to surface as ShelfScanFailed
  // rather than as the raw value object error leaking out of the adapter.
  it('when a value object refuses the value', () => {
    const empty = { books: [{ author: '   ', title: 'Les Choses', confidence: 0.5 }] };

    expect(reject(JSON.stringify(empty))).toThrow(ShelfScanFailed);
  });
});
