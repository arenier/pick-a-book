import { CatalogUnavailable, ScanRef } from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { A_SCAN, aDetectedBook, aReconciler, peste } from '../testing/reconcile-scenario.js';

const camus = aDetectedBook(0, 'La Peste', 'Albert Camus');

describe('ReconcileDetectedBooksUseCase, a catalogue that fails (FR-008)', () => {
  it.each(['unavailable', 'invalid_response'] as const)(
    'marks the book not verified, never not found, on %s',
    async (cause) => {
      const { useCase, catalog, repository } = aReconciler();
      catalog.always(new CatalogUnavailable(cause));

      const result = unwrap(await useCase.execute({ scanRef: A_SCAN, books: [camus] }));

      expect(result.books.map((book) => book.status)).toStrictEqual(['not_verified']);
      const [attempt] = (await repository.findByScan(unwrapScan())).flatMap((b) => b.attempts);
      expect(attempt.result).toStrictEqual({ kind: 'not_verified', cause });
    },
  );

  it('tries once more after an unavailable answer, and uses the second one', async () => {
    const { useCase, catalog } = aReconciler();
    let calls = 0;
    catalog.on(() => ++calls === 1, new CatalogUnavailable('unavailable'));
    catalog.always([peste]);

    const result = unwrap(await useCase.execute({ scanRef: A_SCAN, books: [camus] }));

    expect(result.books[0]).toMatchObject({ status: 'confirmed' });
  });

  it('does not stop the display of the books the catalogue could answer for', async () => {
    const { useCase, catalog } = aReconciler();
    catalog.on(
      (query) => query.title === 'Livre sans réponse',
      new CatalogUnavailable('unavailable'),
    );
    catalog.always([peste]);

    const result = unwrap(
      await useCase.execute({
        scanRef: A_SCAN,
        books: [camus, aDetectedBook(1, 'Livre sans réponse', 'Un Auteur')],
      }),
    );

    expect(result.books.map((book) => book.status)).toStrictEqual(['confirmed', 'not_verified']);
  });
});

describe('ReconcileDetectedBooksUseCase, a catalogue that fails (FR-008), part 2', () => {
  it('keeps what was read, author absent included, on a book not verified', async () => {
    const { useCase, catalog, repository } = aReconciler();
    catalog.always(new CatalogUnavailable('unavailable'));

    await useCase.execute({ scanRef: A_SCAN, books: [aDetectedBook(0, 'La Peste')] });

    const [attempt] = (await repository.findByScan(unwrapScan())).flatMap((b) => b.attempts);
    expect(attempt.read.title).toBe('La Peste');
    expect(attempt.read.author).toBeUndefined();
  });
});

describe('ReconcileDetectedBooksUseCase, a catalogue that is slow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks as not verified, with a timeout, a book whose request takes over 8 s', async () => {
    const { useCase, catalog, repository } = aReconciler();
    catalog.always([peste], 60_000);

    const pending = useCase.execute({ scanRef: A_SCAN, books: [camus] });
    await vi.advanceTimersByTimeAsync(8_000);
    const result = unwrap(await pending);

    expect(result.books[0]).toMatchObject({ status: 'not_verified' });
    const [attempt] = (await repository.findByScan(unwrapScan())).flatMap((b) => b.attempts);
    expect(attempt.result).toStrictEqual({ kind: 'not_verified', cause: 'timeout' });
  });

  it('marks as not verified, with a timeout and no call, the books past the deadline', async () => {
    const { useCase, catalog, repository } = aReconciler();
    catalog.always([peste], 60_000);
    const books = Array.from({ length: 30 }, (_unused, index) =>
      aDetectedBook(index, `Livre ${index}`, 'Un Auteur'),
    );

    const pending = useCase.execute({ scanRef: A_SCAN, books });
    await vi.advanceTimersByTimeAsync(40_000);
    const result = unwrap(await pending);

    expect(result.books).toHaveLength(30);
    expect(result.books.every((book) => book.status === 'not_verified')).toBe(true);
    // Four requests per wave, three waves in 18 s: the rest were never sent.
    expect(catalog.queries.length).toBeLessThanOrEqual(12);
    const causes = (await repository.findByScan(unwrapScan())).flatMap((b) =>
      b.attempts.map((a) => a.result),
    );
    expect(causes).toStrictEqual(
      Array.from({ length: 30 }, () => ({ kind: 'not_verified', cause: 'timeout' })),
    );
  });
});

function unwrapScan(): ScanRef {
  return unwrap(ScanRef.of(A_SCAN));
}
