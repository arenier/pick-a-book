import { describe, expect, it } from 'vitest';

import { Author } from './author.js';
import { BookTitle } from './book-title.js';
import { Confidence } from './confidence.js';
import { DetectedBook } from './detected-book.js';
import { InvalidShelfPhoto } from './invalid-shelf-photo.error.js';
import { ShelfPhoto, isShelfPhotoMediaType } from './shelf-photo.js';

describe('Author', () => {
  it('normalises whitespace', () => {
    expect(Author.of('  Marguerite   Duras ').value).toBe('Marguerite Duras');
  });

  it('rejects an empty name', () => {
    expect(() => Author.of('   ')).toThrow(/empty/u);
  });
});

describe('BookTitle', () => {
  it('rejects an empty title', () => {
    expect(() => BookTitle.of('')).toThrow(/empty/u);
  });

  it('rejects an oversized title', () => {
    expect(() => BookTitle.of('a'.repeat(501))).toThrow(/too long/u);
  });
});

describe('Confidence', () => {
  it.each([-0.1, 1.1, Number.NaN])('rejects %p', (value) => {
    expect(() => Confidence.of(value)).toThrow(/Confidence:/u);
  });

  it('compares against a threshold', () => {
    expect(Confidence.of(0.8).isAtLeast(Confidence.of(0.7))).toBe(true);
    expect(Confidence.of(0.6).isAtLeast(Confidence.of(0.7))).toBe(false);
  });
});

describe('ShelfPhoto', () => {
  // A dedicated error, so HTTP can tell a refused photo (400) from a failing bucket (500).
  it('refuses an off-contract image with InvalidShelfPhoto', () => {
    expect(() => ShelfPhoto.of(new Uint8Array(0), 'image/jpeg')).toThrow(InvalidShelfPhoto);
    expect(() => ShelfPhoto.of(new Uint8Array([1]), 'application/pdf')).toThrow(InvalidShelfPhoto);
    expect(() => ShelfPhoto.of(new Uint8Array(20 * 1024 * 1024 + 1), 'image/jpeg')).toThrow(
      InvalidShelfPhoto,
    );
  });

  it('rejects an empty image', () => {
    expect(() => ShelfPhoto.of(new Uint8Array(0), 'image/jpeg')).toThrow(/empty/u);
  });

  // Proves a media type read back from storage, where it is a bare string again.
  it('tells a supported media type from any other string', () => {
    expect(isShelfPhotoMediaType('image/heic')).toBe(true);
    expect(isShelfPhotoMediaType('application/pdf')).toBe(false);
  });

  it('rejects an unknown media type', () => {
    expect(() => ShelfPhoto.of(new Uint8Array([1, 2, 3]), 'application/pdf')).toThrow(
      /unsupported media type/u,
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

  // The author is not on every spine (ADR 0005, 2026-09-04 amendment): the title identifies
  // the book, the author is optional and reconciliation attaches it downstream.
  it('allows a title-only book when the author is not on the spine', () => {
    const book = DetectedBook.of(undefined, BookTitle.of('Les Choses'), Confidence.of(0.3));

    expect(book.author).toBeUndefined();
    expect(book.title.value).toBe('Les Choses');
  });
});
