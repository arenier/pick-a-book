import {
  ScanRef,
  ShelfBookRef,
  type BookReconciliationRepositoryPort,
} from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { A_SCAN, aDetectedBook, aReconciler, peste } from '../testing/reconcile-scenario.js';
import { GetShelfReconciliationUseCase } from './get-shelf-reconciliation.use-case.js';

describe('GetShelfReconciliationUseCase', () => {
  it('gives the kept state of each book, pending for one never tried', async () => {
    const { useCase, catalog, repository } = aReconciler();
    catalog.always([peste]);
    await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'La Peste', 'Albert Camus')],
    });

    const state = unwrap(
      await new GetShelfReconciliationUseCase(repository).execute({
        scanRef: A_SCAN,
        books: [aDetectedBook(0, 'La Peste', 'Albert Camus'), aDetectedBook(1, 'Un autre')],
      }),
    );

    expect(state.books.map((book) => [book.position, book.status])).toStrictEqual([
      [0, 'confirmed'],
      [1, 'pending'],
    ]);
  });

  // SC-005: a screen shown again calls nobody. The use case is given a repository and nothing else.
  it('has no catalogue nor authority to call', () => {
    expectTypeOf<ConstructorParameters<typeof GetShelfReconciliationUseCase>>().toEqualTypeOf<
      [repository: BookReconciliationRepositoryPort]
    >();
  });

  it('never writes', async () => {
    const { repository } = aReconciler();

    await new GetShelfReconciliationUseCase(repository).execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'La Peste')],
    });

    expect(repository.attemptsOf(unwrapBookRef())).toStrictEqual([]);
  });
});

describe('GetShelfReconciliationUseCase, part 2', () => {
  it('answers an empty list with an empty list', async () => {
    const { repository } = aReconciler();

    const state = unwrap(
      await new GetShelfReconciliationUseCase(repository).execute({ scanRef: A_SCAN, books: [] }),
    );

    expect(state).toStrictEqual({ books: [] });
  });

  it('refuses a reference that is not an analysis', async () => {
    const { repository } = aReconciler();

    const result = await new GetShelfReconciliationUseCase(repository).execute({
      scanRef: 'nope',
      books: [],
    });

    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-value' } });
  });
});

function unwrapBookRef(): ShelfBookRef {
  return unwrap(ShelfBookRef.of(unwrap(ScanRef.of(A_SCAN)), 0));
}
