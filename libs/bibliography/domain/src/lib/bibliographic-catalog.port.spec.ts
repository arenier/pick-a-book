import type { Result } from '@pick-a-book/shared-result';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  BIBLIOGRAPHIC_CATALOG_PORT,
  type BibliographicCatalogPort,
  type CatalogPage,
} from './bibliographic-catalog.port.js';
import type { CatalogName } from './catalog-name.js';
import type { CatalogQuery } from './catalog-query.js';
import type { CatalogUnavailable } from './catalog-unavailable.error.js';

describe('BibliographicCatalogPort', () => {
  // One query at a time: the cascade is the application's (ADR 0014).
  it('runs one query under a signal and fails with an Err', () => {
    expectTypeOf<BibliographicCatalogPort['search']>().toEqualTypeOf<
      (query: CatalogQuery, signal: AbortSignal) => Promise<Result<CatalogPage, CatalogUnavailable>>
    >();
    expectTypeOf<BibliographicCatalogPort['name']>().toEqualTypeOf<CatalogName>();
  });

  it('exposes a string injection token', () => {
    expect(BIBLIOGRAPHIC_CATALOG_PORT).toBe('BibliographicCatalogPort');
  });
});
