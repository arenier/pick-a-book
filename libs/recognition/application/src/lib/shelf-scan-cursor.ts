import { ShelfScanId, type ShelfScanCursor } from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidShelfScanCursor } from './invalid-shelf-scan-cursor.error.js';

/**
 * The cursor of the history as it travels (specs/002-upload-history, research.md §4): base64url
 * of `{createdAt as ISO}|{id}`. Opaque to the client — it hands back what it was given — and
 * proven on the way back in, since a query string is anyone's to edit.
 */
const SEPARATOR = '|';

const BASE64URL = /^[A-Za-z0-9_-]+$/u;

export function encodeCursor(cursor: ShelfScanCursor): string {
  return btoa(`${cursor.createdAt.toISOString()}${SEPARATOR}${cursor.id.value}`)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function decodeCursor(raw: string): Result<ShelfScanCursor, InvalidShelfScanCursor> {
  const text = BASE64URL.test(raw) ? textOf(raw) : undefined;
  const parts = text?.split(SEPARATOR);
  if (parts?.length !== 2) {
    return err(new InvalidShelfScanCursor());
  }

  const [date = '', rawId = ''] = parts;
  const createdAt = new Date(date);
  const id = ShelfScanId.of(rawId);
  if (Number.isNaN(createdAt.getTime()) || !id.ok) {
    return err(new InvalidShelfScanCursor());
  }

  return ok({ createdAt, id: id.value });
}

/** The text a base64url string spells, or `undefined` when it spells none. */
function textOf(base64url: string): string | undefined {
  const base64 = base64url.replaceAll('-', '+').replaceAll('_', '/');
  try {
    return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  } catch {
    // A length no base64 has: not a cursor — the caller turns the absence into an Err.
    return undefined;
  }
}
