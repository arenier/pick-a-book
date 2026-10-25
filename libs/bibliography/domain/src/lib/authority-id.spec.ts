import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { AuthorityId } from './authority-id.js';

describe('AuthorityId', () => {
  it('accepts a non-empty identifier and trims it', () => {
    expect(unwrap(AuthorityId.of('  ark:/12148/cb12345678z  ')).value).toBe(
      'ark:/12148/cb12345678z',
    );
  });

  it('rejects an empty identifier', () => {
    expect(AuthorityId.of('   ').ok).toBe(false);
  });

  it('rejects an identifier longer than 200 characters', () => {
    expect(AuthorityId.of('a'.repeat(201)).ok).toBe(false);
    expect(AuthorityId.of('a'.repeat(200)).ok).toBe(true);
  });
});
