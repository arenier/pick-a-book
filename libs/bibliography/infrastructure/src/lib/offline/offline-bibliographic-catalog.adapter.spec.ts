import { AuthorityId, CatalogQuery } from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { OfflineBibliographicCatalogAdapter } from './offline-bibliographic-catalog.adapter.js';

const signal = new AbortController().signal;

describe('OfflineBibliographicCatalogAdapter', () => {
  const adapter = new OfflineBibliographicCatalogAdapter();

  it('is named offline', () => {
    expect(adapter.name.value).toBe('offline');
  });

  it('is always unavailable for a search', async () => {
    const query = unwrap(CatalogQuery.of({ title: 'La Peste', maxRecords: 20, format: 'full' }));

    await expect(adapter.search(query, signal)).resolves.toMatchObject({
      ok: false,
      error: { kind: 'catalog-unavailable', cause: 'unavailable' },
    });
  });

  it('is always unavailable for an authority', async () => {
    await expect(adapter.rejectedForms(unwrap(AuthorityId.of('1')), signal)).resolves.toMatchObject(
      {
        ok: false,
        error: { cause: 'unavailable' },
      },
    );
  });
});
