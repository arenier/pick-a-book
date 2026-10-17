import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { InvalidValue } from '../invalid-value.error.js';
import { OwnerId } from './owner-id.js';

const ownerId = (raw: string) => unwrap(OwnerId.of(raw));

describe('OwnerId', () => {
  it('keeps a single key segment, trimmed', () => {
    expect(ownerId('  someone ').value).toBe('someone');
  });

  it.each(['', '   '])('rejects %p as empty', (raw) => {
    expect(OwnerId.of(raw)).toStrictEqual(err(new InvalidValue('OwnerId: cannot be empty')));
  });

  // It becomes the first segment of every bucket key: a slash would add a level to the
  // layout, a dot-dot would climb out of it.
  it.each(['a/b', '..', '.'])('rejects %p, not a single key segment', (raw) => {
    expect(OwnerId.of(raw)).toStrictEqual(
      err(new InvalidValue(`OwnerId: "${raw}" is not a single bucket key segment`)),
    );
  });

  it('compares by value', () => {
    expect(ownerId('someone').equals(ownerId('someone'))).toBe(true);
    expect(ownerId('someone').equals(ownerId('default'))).toBe(false);
  });
});
