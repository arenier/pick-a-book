import { CatalogUnavailable, ScanRef, type CatalogQuery } from '@pick-a-book/bibliography-domain';
import { aRecord } from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FakeBibliographicCatalog } from '../testing/fake-bibliographic-catalog.js';
import { A_SCAN, aDetectedBook, aReconciler, peste } from '../testing/reconcile-scenario.js';

const titleOf = (index: number) => `Livre numéro ${index} du rayon`;
/** Twenty-one books are found by the first request, nine by the second (the author alone). */
function scriptThirtyBooks(catalog: FakeBibliographicCatalog): void {
  const indexes = Array.from({ length: 30 }, (_unused, index) => index);
  const known = indexes.map((index) =>
    aRecord({
      id: `ark:/12148/book-${index}`,
      title: titleOf(index),
      authors: [{ name: 'Auteur, Un', role: 'main' }],
    }),
  );
  const foundFirst = new Set(
    indexes.filter((index) => index % 10 >= 3).map((index) => titleOf(index)),
  );

  catalog.on((query) => isTitleIn(query, foundFirst), known, 1_500);
  catalog.on((query) => query.title === undefined, known, 1_500);
  catalog.always([], 1_500);
}

function isTitleIn(query: CatalogQuery, titles: ReadonlySet<string>): boolean {
  return query.title !== undefined && titles.has(query.title);
}

const scanRef = () => unwrap(ScanRef.of(A_SCAN));

describe('ReconcileDetectedBooksUseCase, two reconciliations at once', () => {
  // The screen mounted twice by StrictMode, a double tap on « retry »: not an error (research §3).
  it('answers both the same state, with a single final attempt per book', async () => {
    const { useCase, catalog, repository } = aReconciler();
    catalog.always([peste], 100);
    const books = [
      aDetectedBook(0, 'La Peste', 'Albert Camus'),
      aDetectedBook(1, 'Rien', 'Personne'),
    ];

    const [first, second] = await Promise.all([
      useCase.execute({ scanRef: A_SCAN, books }),
      useCase.execute({ scanRef: A_SCAN, books }),
    ]);

    expect(unwrap(first)).toStrictEqual(unwrap(second));
    const kept = await repository.findByScan(scanRef());
    expect(kept.map((book) => book.attempts.length)).toStrictEqual([1, 1]);
  });
});

describe('ReconcileDetectedBooksUseCase, thirty books (SC-003)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // 1.5 s a request, 1.3 requests a book: every book settled within 18 simulated seconds.
  it('settles every book within the budget, none timed out', async () => {
    const { useCase, catalog, repository } = aReconciler();
    scriptThirtyBooks(catalog);
    const books = Array.from({ length: 30 }, (_unused, index) =>
      aDetectedBook(index, titleOf(index), 'Un Auteur'),
    );

    const pending = useCase.execute({ scanRef: A_SCAN, books });
    await vi.advanceTimersByTimeAsync(18_000);
    const result = unwrap(await pending);

    expect(result.books.every((book) => book.status === 'confirmed')).toBe(true);
    const causes = (await repository.findByScan(scanRef())).flatMap((b) =>
      b.attempts.map((attempt) => attempt.result.kind),
    );
    expect(causes).not.toContain('not_verified');
    expect(catalog.queries.length).toBeLessThanOrEqual(45);
  });

  it('never reports a catalogue failure as an Err of the use case', async () => {
    const { useCase, catalog } = aReconciler();
    catalog.always(new CatalogUnavailable('unavailable'));

    const result = await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'La Peste', 'Albert Camus')],
    });

    expect(result.ok).toBe(true);
  });
});
