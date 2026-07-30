import { Author } from './author.js';
import { BookTitle } from './book-title.js';
import { Confidence } from './confidence.js';
import { DetectedBook } from './detected-book.js';
import { ShelfPhoto } from './shelf-photo.js';

describe('Author', () => {
  it('normalises whitespace', () => {
    expect(Author.of('  Marguerite   Duras ').value).toBe('Marguerite Duras');
  });

  it('rejects an empty name', () => {
    expect(() => Author.of('   ')).toThrow(/empty/);
  });
});

describe('BookTitle', () => {
  it('rejects an empty title', () => {
    expect(() => BookTitle.of('')).toThrow(/empty/);
  });

  it('rejects an oversized title', () => {
    expect(() => BookTitle.of('a'.repeat(501))).toThrow(/too long/);
  });
});

describe('Confidence', () => {
  it.each([-0.1, 1.1, Number.NaN])('rejects %p', (value) => {
    expect(() => Confidence.of(value)).toThrow();
  });

  it('compares against a threshold', () => {
    expect(Confidence.of(0.8).isAtLeast(Confidence.of(0.7))).toBe(true);
    expect(Confidence.of(0.6).isAtLeast(Confidence.of(0.7))).toBe(false);
  });
});

describe('ShelfPhoto', () => {
  it('rejects an empty image', () => {
    expect(() => ShelfPhoto.of(new Uint8Array(0), 'image/jpeg')).toThrow(/empty/);
  });

  it('rejects an unknown media type', () => {
    expect(() => ShelfPhoto.of(new Uint8Array([1, 2, 3]), 'application/pdf')).toThrow(
      /unsupported media type/,
    );
  });
});

describe('DetectedBook', () => {
  it('exposes its confidence for downstream filtering', () => {
    const book = DetectedBook.of(
      Author.of('Georges Perec'),
      BookTitle.of('La Vie mode d emploi'),
      Confidence.of(0.42),
    );

    expect(book.isAtLeast(Confidence.of(0.5))).toBe(false);
    expect(book.isAtLeast(Confidence.of(0.4))).toBe(true);
  });
});
