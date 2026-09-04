import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { booksFor, parseGroundTruth } from './ground-truth.js';

const VALID = `
version: 1
photos:
  - file: shelf-a.jpg
    books:
      - author: Albert Camus
        title: La Peste
      - author: Franz Kafka
        title: Le Procès
  - file: shelf-b.jpg
    books: []
`;

describe('parseGroundTruth', () => {
  it('reads photos and their books', () => {
    const truth = parseGroundTruth(VALID);

    expect(truth.photos).toHaveLength(2);
    expect(truth.photos[0].file).toBe('shelf-a.jpg');
    expect(truth.photos[0].books).toStrictEqual([
      { author: 'Albert Camus', title: 'La Peste' },
      { author: 'Franz Kafka', title: 'Le Procès' },
    ]);
  });

  it('accepts a shelf with no readable book as an empty list', () => {
    const truth = parseGroundTruth(VALID);

    expect(truth.photos[1].books).toStrictEqual([]);
  });

  it('keeps a photo description when present, and tolerates its absence', () => {
    const described = `
version: 1
photos:
  - file: shelf-a.jpg
    description: A dense shelf, spines mostly legible.
    books: []
  - file: shelf-b.jpg
    books: []
`;
    const truth = parseGroundTruth(described);

    expect(truth.photos[0].description).toBe('A dense shelf, spines mostly legible.');
    expect(truth.photos[1].description).toBeUndefined();
  });
});

describe('parseGroundTruth — rejects invalid input', () => {
  it('rejects a wrong version rather than guessing', () => {
    expect(() => parseGroundTruth('version: 2\nphotos: []\n')).toThrow(/version/u);
  });

  it('rejects a book missing a field', () => {
    const missing = `
version: 1
photos:
  - file: shelf.jpg
    books:
      - author: Albert Camus
`;
    expect(() => parseGroundTruth(missing)).toThrow(ZodError);
  });

  it('rejects an empty author, which is never a real reading', () => {
    const empty = `
version: 1
photos:
  - file: shelf.jpg
    books:
      - author: ""
        title: La Peste
`;
    expect(() => parseGroundTruth(empty)).toThrow(ZodError);
  });
});

describe('booksFor', () => {
  it('returns the books of a known photo', () => {
    const truth = parseGroundTruth(VALID);

    expect(booksFor(truth, 'shelf-a.jpg')).toHaveLength(2);
  });

  it('returns undefined for a photo absent from the ground truth', () => {
    const truth = parseGroundTruth(VALID);

    expect(booksFor(truth, 'unknown.jpg')).toBeUndefined();
  });
});
