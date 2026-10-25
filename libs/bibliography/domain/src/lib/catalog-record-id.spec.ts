import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { CatalogRecordId } from './catalog-record-id.js';

describe('CatalogRecordId', () => {
  it('accepts a non-empty identifier and trims it', () => {
    expect(unwrap(CatalogRecordId.of('  ark:/12148/cb11111111x  ')).value).toBe(
      'ark:/12148/cb11111111x',
    );
  });

  it('rejects an empty identifier', () => {
    expect(CatalogRecordId.of('   ').ok).toBe(false);
  });

  it('rejects an identifier longer than 200 characters', () => {
    expect(CatalogRecordId.of('a'.repeat(201)).ok).toBe(false);
    expect(CatalogRecordId.of('a'.repeat(200)).ok).toBe(true);
  });
});
