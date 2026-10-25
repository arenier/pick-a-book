import {
  CatalogUnavailable,
  type BibliographicCatalogPort,
  type CatalogPage,
  type CatalogQuery,
} from '@pick-a-book/bibliography-domain';
import { StubBibliographicCatalogAdapter } from '@pick-a-book/bibliography-infrastructure';
import type {
  DetectedBook,
  ShelfPhoto,
  ShelfScanFailed,
  ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { StubShelfScannerAdapter } from '@pick-a-book/recognition-infrastructure';
import { err, type Result } from '@pick-a-book/shared-result';
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

/** The stub scanner, counting the photos it is given. */
class CountingScanner implements ShelfScannerPort {
  private readonly inner = new StubShelfScannerAdapter();
  scans = 0;

  async scan(photo: ShelfPhoto): Promise<Result<DetectedBook[], ShelfScanFailed>> {
    this.scans += 1;
    return this.inner.scan(photo);
  }
}

/** The stub catalogue, down until it is restored. */
class RestorableCatalog implements BibliographicCatalogPort {
  private readonly inner = new StubBibliographicCatalogAdapter();
  readonly name = this.inner.name;
  down = true;

  async search(
    query: CatalogQuery,
    signal: AbortSignal,
  ): Promise<Result<CatalogPage, CatalogUnavailable>> {
    return this.down
      ? err(new CatalogUnavailable('unavailable'))
      : this.inner.search(query, signal);
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
      Array.from({ length: 5 }, () => 'not_verified'),
    );
    expect(body.books[0].read).toStrictEqual({ title: "L'Amant", author: 'Marguerite Duras' });
  });
});

describe('trying again once the catalogue is back (FR-014, US4)', () => {
  const catalog = new RestorableCatalog();
  const scanner = new CountingScanner();
  const api = aRunningReconciliationApi({ catalog, scanner });

  it('gives the books not verified a final status, without scanning the photo again', async () => {
    const id = await api.completedScan();
    const down = await reconciliationOf(await api.reconcile(id));
    const scansBefore = scanner.scans;
    catalog.down = false;

    const back = await reconciliationOf(await api.reconcile(id));

    expect(scanner.scans).toBe(scansBefore);
    expect(down.books.every((book) => book.status === 'not_verified')).toBe(true);
    expect(back.books.map((book) => book.status)).toStrictEqual([
      'confirmed',
      'confirmed',
      'confirmed',
      'not_found',
      'ambiguous',
    ]);
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
