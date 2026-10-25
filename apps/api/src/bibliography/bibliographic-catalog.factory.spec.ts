import {
  BnfAuthorityAdapter,
  BnfSruCatalogAdapter,
  OfflineBibliographicCatalogAdapter,
  StubAuthorityAdapter,
  StubBibliographicCatalogAdapter,
} from '@pick-a-book/bibliography-infrastructure';
import { describe, expect, it } from 'vitest';

import { createBibliographicCatalog } from './bibliographic-catalog.factory';

describe('createBibliographicCatalog', () => {
  it('binds the BnF adapters for bnf', () => {
    const { catalog, authorities } = createBibliographicCatalog({ provider: 'bnf' });

    expect(catalog).toBeInstanceOf(BnfSruCatalogAdapter);
    expect(authorities).toBeInstanceOf(BnfAuthorityAdapter);
  });

  it('binds the in-memory adapters for stub', () => {
    const { catalog, authorities } = createBibliographicCatalog({ provider: 'stub' });

    expect(catalog).toBeInstanceOf(StubBibliographicCatalogAdapter);
    expect(authorities).toBeInstanceOf(StubAuthorityAdapter);
  });

  it('binds the always-unavailable adapter, for both ports, for offline', () => {
    const { catalog, authorities } = createBibliographicCatalog({ provider: 'offline' });

    expect(catalog).toBeInstanceOf(OfflineBibliographicCatalogAdapter);
    expect(authorities).toBeInstanceOf(OfflineBibliographicCatalogAdapter);
  });

  it('names the catalogue it binds, as kept with each attempt', () => {
    expect(createBibliographicCatalog({ provider: 'bnf' }).catalog.name.value).toBe('bnf');
    expect(createBibliographicCatalog({ provider: 'stub' }).catalog.name.value).toBe('stub');
    expect(createBibliographicCatalog({ provider: 'offline' }).catalog.name.value).toBe('offline');
  });
});
