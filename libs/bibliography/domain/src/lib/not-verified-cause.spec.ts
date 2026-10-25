import { describe, expect, it } from 'vitest';

import { isNotVerifiedCause, NOT_VERIFIED_CAUSES } from './not-verified-cause.js';

describe('NotVerifiedCause', () => {
  it('recognises every cause', () => {
    expect(NOT_VERIFIED_CAUSES.every((cause) => isNotVerifiedCause(cause))).toBe(true);
  });

  it('refuses a value read back from storage that is not a cause', () => {
    expect(isNotVerifiedCause('down')).toBe(false);
  });
});
