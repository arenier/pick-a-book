import type { Result } from '@pick-a-book/shared-result';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { AuthorityId } from './authority-id.js';
import { AUTHORITY_PORT, type AuthorityPort } from './authority.port.js';
import type { CatalogUnavailable } from './catalog-unavailable.error.js';

describe('AuthorityPort', () => {
  it('rejects nothing: it fails with an Err', () => {
    expectTypeOf<AuthorityPort['rejectedForms']>().toEqualTypeOf<
      (
        id: AuthorityId,
        signal: AbortSignal,
      ) => Promise<Result<readonly string[], CatalogUnavailable>>
    >();
  });

  it('exposes a string injection token', () => {
    expect(AUTHORITY_PORT).toBe('AuthorityPort');
  });
});
