import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { ScanRef } from './scan-ref.js';

describe('ScanRef', () => {
  it('accepts a UUID and lower-cases it', () => {
    const ref = unwrap(ScanRef.of('0E1D6D5C-0B5E-4F5B-8F5B-3C8D3B7A9A11'));

    expect(ref.value).toBe('0e1d6d5c-0b5e-4f5b-8f5b-3c8d3b7a9a11');
  });

  it('rejects anything else', () => {
    expect(ScanRef.of('not-a-uuid').ok).toBe(false);
    expect(ScanRef.of('').ok).toBe(false);
  });
});
