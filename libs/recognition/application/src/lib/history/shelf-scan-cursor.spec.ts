import { ShelfScanId, type ShelfScanCursor } from '@pick-a-book/recognition-domain';
import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { InvalidShelfScanCursor } from './invalid-shelf-scan-cursor.error.js';
import { decodeCursor, encodeCursor } from './shelf-scan-cursor.js';

const anId = '0a7d3e1b-4b5d-4e6f-8a7b-9c0d1e2f3a4b';
const base64url = (text: string) =>
  btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

const aCursor = (): ShelfScanCursor => ({
  createdAt: new Date('2026-09-26T10:41:55.002Z'),
  id: unwrap(ShelfScanId.of(anId)),
});

// specs/002-upload-history, research.md §4: the cursor is opaque to the client, and what comes
// back from it is proven, never assumed — it travels in a query string anyone can edit.
describe('the cursor of the history', () => {
  it('goes there and back, down to the millisecond', () => {
    const cursor = unwrap(decodeCursor(encodeCursor(aCursor())));

    expect(cursor.createdAt).toStrictEqual(new Date('2026-09-26T10:41:55.002Z'));
    expect(cursor.id.value).toBe(anId);
  });

  it('is base64url of « date|id », safe in a URL as it is', () => {
    const encoded = encodeCursor(aCursor());

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encoded).toBe(base64url(`2026-09-26T10:41:55.002Z|${anId}`));
  });
});

describe('decoding a cursor nobody should have made', () => {
  it.each([
    ['text that is not base64url', 'not a cursor!'],
    ['an empty string', ''],
    ['no separator', base64url('2026-09-26T10:41:55.002Z')],
    ['a date that is not one', base64url(`yesterday|${anId}`)],
    ['an id that is not a UUID', base64url('2026-09-26T10:41:55.002Z|not-a-uuid')],
    ['an extra part', base64url(`2026-09-26T10:41:55.002Z|${anId}|x`)],
  ])('rejects %s', (_label, raw) => {
    expect(decodeCursor(raw)).toStrictEqual(err(new InvalidShelfScanCursor()));
  });

  it('says what it is: a kind HTTP maps, a message that names no detail', () => {
    const error = new InvalidShelfScanCursor();

    expect(error.kind).toBe('invalid-shelf-scan-cursor');
    expect(error.name).toBe('InvalidShelfScanCursor');
    expect(error.message).toBe('Invalid cursor');
  });
});
