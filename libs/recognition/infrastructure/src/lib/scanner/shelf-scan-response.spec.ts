import { ShelfScanFailed } from '@pick-a-book/recognition-domain';
import { ok, unwrap, type Result } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { toDetectedBooks } from './shelf-scan-response.js';

/** The failure a parse answered — `undefined` when it succeeded, which no test below expects. */
const failureOf = <T>(result: Result<T, ShelfScanFailed>) => (result.ok ? undefined : result.error);

const wellFormed = {
  books: [
    { author: 'Marguerite Duras', title: "L'Amant", confidence: 0.94 },
    { author: 'Georges Perec', title: 'Les Choses', confidence: 0.62 },
  ],
};

describe('toDetectedBooks', () => {
  it('maps a well-formed payload onto the domain value objects', () => {
    const books = unwrap(toDetectedBooks(JSON.stringify(wellFormed)));

    expect(books).toHaveLength(2);
    expect(books[0]?.author?.value).toBe('Marguerite Duras');
    expect(books[0]?.title.value).toBe("L'Amant");
    expect(books[0]?.confidence.value).toBe(0.94);
  });

  // A photo with no readable book is not an error (ADR 0005): it is an empty array.
  it('accepts an empty list rather than treating it as a failure', () => {
    expect(toDetectedBooks(JSON.stringify({ books: [] }))).toStrictEqual(ok([]));
  });

  // Providers routinely wrap JSON in a markdown fence despite being asked not to. Tolerated
  // here because the payload itself is still verifiable — nothing is guessed.
  it('unwraps a fenced payload', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(wellFormed)}\n\`\`\``;

    expect(unwrap(toDetectedBooks(fenced))).toHaveLength(2);
  });

  // The author is optional (ADR 0005, 2026-09-04 amendment): a spine may not print it. The
  // title identifies the book; an absent or blank author is a title-only reading, not a failure.
  it('accepts a book whose author key is absent, as a title-only reading', () => {
    const [book] = unwrap(
      toDetectedBooks(JSON.stringify({ books: [{ title: 'Les Choses', confidence: 0.5 }] })),
    );

    expect(book.author).toBeUndefined();
    expect(book.title.value).toBe('Les Choses');
  });

  it('treats a blank author as absent rather than refusing the payload', () => {
    const [book] = unwrap(
      toDetectedBooks(
        JSON.stringify({ books: [{ author: '   ', title: 'Les Choses', confidence: 0.5 }] }),
      ),
    );

    expect(book.author).toBeUndefined();
    expect(book.title.value).toBe('Les Choses');
  });
});

describe('toDetectedBooks answers ShelfScanFailed to an off-contract answer', () => {
  it('when the payload is not JSON at all', () => {
    expect(failureOf(toDetectedBooks('I could not read this shelf, sorry!'))).toBeInstanceOf(
      ShelfScanFailed,
    );
  });

  it('when a field is missing', () => {
    const missingTitle = { books: [{ author: 'Perec', confidence: 0.5 }] };

    expect(failureOf(toDetectedBooks(JSON.stringify(missingTitle)))).toBeInstanceOf(
      ShelfScanFailed,
    );
  });

  it('when confidence falls outside [0, 1]', () => {
    const outOfRange = { books: [{ author: 'Perec', title: 'Les Choses', confidence: 1.4 }] };

    expect(failureOf(toDetectedBooks(JSON.stringify(outOfRange)))).toBeInstanceOf(ShelfScanFailed);
  });

  it('when a field holds the wrong type', () => {
    const wrongType = { books: [{ author: 'Perec', title: 'Les Choses', confidence: 'high' }] };

    expect(failureOf(toDetectedBooks(JSON.stringify(wrongType)))).toBeInstanceOf(ShelfScanFailed);
  });

  // The title is the irreducible identifier: the domain refuses a blank one, and that failure
  // has to surface as ShelfScanFailed rather than as the raw value object error leaking out.
  it('when a value object refuses the value', () => {
    const blankTitle = { books: [{ author: 'Perec', title: '   ', confidence: 0.5 }] };

    expect(failureOf(toDetectedBooks(JSON.stringify(blankTitle)))).toBeInstanceOf(ShelfScanFailed);
  });
});
