import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { Author } from './author.js';
import { BookTitle } from './book-title.js';
import { Confidence } from './confidence.js';
import { DetectedBook } from './detected-book.js';
import { InvalidShelfPhoto } from './invalid-shelf-photo.error.js';
import { InvalidValue } from './invalid-value.error.js';
import { ShelfPhoto, isShelfPhotoMediaType } from './shelf-photo.js';

// Specs build their fixtures with `unwrap`: a value that does not construct is a broken
// fixture, and failing loudly is what a test wants. Production code never does this.
const author = (raw: string) => unwrap(Author.of(raw));
const title = (raw: string) => unwrap(BookTitle.of(raw));
const confidence = (raw: number) => unwrap(Confidence.of(raw));

describe('Author', () => {
  it('normalises whitespace', () => {
    expect(author('  Marguerite   Duras ').value).toBe('Marguerite Duras');
  });

  it('rejects an empty name', () => {
    expect(Author.of('   ')).toStrictEqual(
      err(new InvalidValue('Author: the name read cannot be empty')),
    );
  });

  it('rejects an oversized name', () => {
    expect(Author.of('a'.repeat(201))).toStrictEqual(
      err(new InvalidValue('Author: name too long (201 characters, 200 at most)')),
    );
  });
});

describe('BookTitle', () => {
  it('rejects an empty title', () => {
    expect(BookTitle.of('')).toStrictEqual(
      err(new InvalidValue('BookTitle: the title read cannot be empty')),
    );
  });

  it('rejects an oversized title', () => {
    expect(BookTitle.of('a'.repeat(501))).toStrictEqual(
      err(new InvalidValue('BookTitle: title too long (501 characters, 500 at most)')),
    );
  });
});

describe('Confidence', () => {
  it.each([-0.1, 1.1])('rejects %p, outside [0, 1]', (value) => {
    expect(Confidence.of(value)).toStrictEqual(
      err(new InvalidValue(`Confidence: value outside [0, 1] (${value})`)),
    );
  });

  it('rejects NaN', () => {
    expect(Confidence.of(Number.NaN)).toStrictEqual(
      err(new InvalidValue('Confidence: not a number (NaN)')),
    );
  });

  it('compares against a threshold', () => {
    expect(confidence(0.8).isAtLeast(confidence(0.7))).toBe(true);
    expect(confidence(0.6).isAtLeast(confidence(0.7))).toBe(false);
  });
});

describe('ShelfPhoto', () => {
  // A dedicated error, so HTTP can tell a refused photo (400) from a failing bucket (500).
  it.each([
    ['an empty image', new Uint8Array(0), 'image/jpeg', 'empty image'],
    [
      'an unsupported media type',
      new Uint8Array([1, 2, 3]),
      'application/pdf',
      'unsupported media type (application/pdf) — expected image/jpeg, image/png, image/webp, image/heic',
    ],
    [
      'an image over 20 MB',
      new Uint8Array(20 * 1024 * 1024 + 1),
      'image/jpeg',
      'image too large (20971521 bytes, 20971520 at most)',
    ],
  ])('refuses %s with InvalidShelfPhoto', (_label, bytes, mediaType, reason) => {
    expect(ShelfPhoto.of(bytes, mediaType)).toStrictEqual(err(new InvalidShelfPhoto(reason)));
  });

  it('accepts a supported image', () => {
    const photo = unwrap(ShelfPhoto.of(new Uint8Array([1]), 'image/png'));

    expect(photo.mediaType).toBe('image/png');
    expect(photo.bytes).toStrictEqual(new Uint8Array([1]));
  });

  // Proves a media type read back from storage, where it is a bare string again.
  it('tells a supported media type from any other string', () => {
    expect(isShelfPhotoMediaType('image/heic')).toBe(true);
    expect(isShelfPhotoMediaType('application/pdf')).toBe(false);
  });
});

describe('DetectedBook', () => {
  it('exposes its confidence for downstream filtering', () => {
    const book = DetectedBook.of(
      author('Georges Perec'),
      title('La Vie mode d emploi'),
      confidence(0.42),
    );

    expect(book.isAtLeast(confidence(0.5))).toBe(false);
    expect(book.isAtLeast(confidence(0.4))).toBe(true);
  });

  // The author is not on every spine (ADR 0005, 2026-09-04 amendment): the title identifies
  // the book, the author is optional and reconciliation attaches it downstream.
  it('allows a title-only book when the author is not on the spine', () => {
    const book = DetectedBook.of(undefined, title('Les Choses'), confidence(0.3));

    expect(book.author).toBeUndefined();
    expect(book.title.value).toBe('Les Choses');
  });
});
