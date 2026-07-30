import { Author } from './author.js';
import { BookTitle } from './book-title.js';
import { Confidence } from './confidence.js';
import { DetectedBook } from './detected-book.js';
import { ShelfPhoto } from './shelf-photo.js';

describe('Author', () => {
  it('normalise les espaces', () => {
    expect(Author.of('  Marguerite   Duras ').value).toBe('Marguerite Duras');
  });

  it('refuse un nom vide', () => {
    expect(() => Author.of('   ')).toThrow(/vide/);
  });
});

describe('BookTitle', () => {
  it('refuse un titre vide', () => {
    expect(() => BookTitle.of('')).toThrow(/vide/);
  });

  it('refuse un titre demesure', () => {
    expect(() => BookTitle.of('a'.repeat(501))).toThrow(/trop long/);
  });
});

describe('Confidence', () => {
  it.each([-0.1, 1.1, Number.NaN])('refuse %p', (value) => {
    expect(() => Confidence.of(value)).toThrow();
  });

  it('compare a un seuil', () => {
    expect(Confidence.of(0.8).isAtLeast(Confidence.of(0.7))).toBe(true);
    expect(Confidence.of(0.6).isAtLeast(Confidence.of(0.7))).toBe(false);
  });
});

describe('ShelfPhoto', () => {
  it('refuse une image vide', () => {
    expect(() => ShelfPhoto.of(new Uint8Array(0), 'image/jpeg')).toThrow(/vide/);
  });

  it('refuse un type de media inconnu', () => {
    expect(() => ShelfPhoto.of(new Uint8Array([1, 2, 3]), 'application/pdf')).toThrow(
      /non supporte/,
    );
  });
});

describe('DetectedBook', () => {
  it('expose sa confiance pour le filtrage en aval', () => {
    const book = DetectedBook.of(
      Author.of('Georges Perec'),
      BookTitle.of('La Vie mode d emploi'),
      Confidence.of(0.42),
    );

    expect(book.isAtLeast(Confidence.of(0.5))).toBe(false);
    expect(book.isAtLeast(Confidence.of(0.4))).toBe(true);
  });
});
