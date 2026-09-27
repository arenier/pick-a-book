import { describe, expect, it } from 'vitest';

import { OwnerId } from './owner-id.js';

describe('OwnerId', () => {
  it('keeps a single key segment, trimmed', () => {
    expect(OwnerId.of('  someone ').value).toBe('someone');
  });

  // It becomes the first segment of every bucket key: a slash would add a level to the
  // layout, a dot-dot would climb out of it.
  it.each(['', '   ', 'a/b', '..', '.'])('rejects %p', (raw) => {
    expect(() => OwnerId.of(raw)).toThrow(/OwnerId/u);
  });

  it('compares by value', () => {
    expect(OwnerId.of('someone').equals(OwnerId.of('someone'))).toBe(true);
    expect(OwnerId.of('someone').equals(OwnerId.of('default'))).toBe(false);
  });
});
