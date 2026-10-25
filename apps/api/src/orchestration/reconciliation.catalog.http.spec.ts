import {
  type BibliographicCatalogPort,
  type CatalogPage,
  type CatalogQuery,
  type CatalogUnavailable,
} from '@pick-a-book/bibliography-domain';
import { StubBibliographicCatalogAdapter } from '@pick-a-book/bibliography-infrastructure';
import type { Result } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { reconciliationOf } from './testing/reconciliation-body';
import { aRunningReconciliationApi } from './testing/running-reconciliation-api';

/** The stub catalogue, with a count of the queries it was sent. */
class CountingCatalog implements BibliographicCatalogPort {
  private readonly inner = new StubBibliographicCatalogAdapter();
  readonly name = this.inner.name;
  queries = 0;

  async search(
    query: CatalogQuery,
    signal: AbortSignal,
  ): Promise<Result<CatalogPage, CatalogUnavailable>> {
    this.queries += 1;
    return this.inner.search(query, signal);
  }
}

describe('the reconciliation with a catalogue that is down (FR-008, SC-004)', () => {
  const api = aRunningReconciliationApi({ catalogProvider: 'offline' });

  it('answers 200 with every book not verified, never a failure', async () => {
    const id = await api.completedScan();

    const response = await api.reconcile(id);
    const body = await reconciliationOf(response);

    expect(response.status).toBe(200);
    expect(body.books.map((book) => book.status)).toStrictEqual(
      Array.from({ length: 4 }, () => 'not_verified'),
    );
    expect(body.books[0].read).toStrictEqual({ title: "L'Amant", author: 'Marguerite Duras' });
  });
});

describe('the reconciliation and the catalogue (SC-005)', () => {
  const catalog = new CountingCatalog();
  const api = aRunningReconciliationApi({ catalog });

  it('asks the catalogue for a POST, never for a GET nor for a second POST', async () => {
    const id = await api.completedScan();
    await api.reconcile(id);
    const afterFirst = catalog.queries;

    await api.read(id);
    await api.reconcile(id);
    await api.read(id);

    expect(afterFirst).toBeGreaterThan(0);
    expect(catalog.queries).toBe(afterFirst);
  });

  it('asks the catalogue nothing for a GET before any POST', async () => {
    const before = catalog.queries;
    const id = await api.completedScan();

    await api.read(id);

    expect(catalog.queries).toBe(before);
  });
});

describe('the reconciliation and the daily cap on analyses (FR-025)', () => {
  const api = aRunningReconciliationApi({ dailyScanLimit: '1' });

  it('does not use up the cap: one analysis, then as many reconciliations as wanted', async () => {
    const id = await api.completedScan();

    const statuses = await Promise.all(
      [1, 2, 3, 4].map(async () => (await api.reconcile(id)).status),
    );

    expect(statuses).toStrictEqual([200, 200, 200, 200]);
  });
});
