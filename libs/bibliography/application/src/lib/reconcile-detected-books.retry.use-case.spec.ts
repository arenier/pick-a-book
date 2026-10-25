import { CatalogUnavailable, ScanRef } from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { A_SCAN, aDetectedBook, aReconciler, peste } from '../testing/reconcile-scenario.js';

const books = [
  aDetectedBook(0, 'La Peste', 'Albert Camus'),
  aDetectedBook(1, 'Livre sans réponse', 'Un Auteur'),
];

const failingForTheSecond = () => {
  const scenario = aReconciler();
  const state = { down: true };
  scenario.catalog.on(
    (query) => state.down && query.title === 'Livre sans réponse',
    new CatalogUnavailable('unavailable'),
  );
  scenario.catalog.always([peste]);

  return { ...scenario, recover: () => (state.down = false) };
};

/** A second call after a catalogue that failed for one book (FR-014, US4). */
describe('ReconcileDetectedBooksUseCase, trying again', () => {
  it('asks the catalogue only about the books still not verified', async () => {
    const { useCase, catalog, recover } = failingForTheSecond();
    await useCase.execute({ scanRef: A_SCAN, books });
    const before = catalog.queries.length;
    catalog.queries.length = 0;
    recover();

    await useCase.execute({ scanRef: A_SCAN, books });

    expect(before).toBeGreaterThan(0);
    expect(catalog.queries.every((query) => query.title !== 'La Peste')).toBe(true);
    expect(catalog.queries.length).toBeGreaterThan(0);
  });

  it('leaves the final books intact and settles the others', async () => {
    const { useCase, recover } = failingForTheSecond();
    const first = unwrap(await useCase.execute({ scanRef: A_SCAN, books }));
    recover();

    const second = unwrap(await useCase.execute({ scanRef: A_SCAN, books }));

    expect(first.books.map((book) => book.status)).toStrictEqual(['confirmed', 'not_verified']);
    expect(second.books[0]).toStrictEqual(first.books[0]);
    expect(second.books[1]?.status).not.toBe('not_verified');
  });
});

describe('ReconcileDetectedBooksUseCase, trying again, part 2', () => {
  it('adds an attempt without erasing the previous « not verified »', async () => {
    const { useCase, repository, recover } = failingForTheSecond();
    await useCase.execute({ scanRef: A_SCAN, books });
    recover();

    await useCase.execute({ scanRef: A_SCAN, books });

    const [, second] = await repository.findByScan(unwrap(ScanRef.of(A_SCAN)));
    const kinds = second.attempts.map((attempt) => attempt.result.kind);
    expect(kinds[0]).toBe('not_verified');
    expect(kinds).toHaveLength(2);
    expect(kinds[1]).not.toBe('not_verified');
  });
});
