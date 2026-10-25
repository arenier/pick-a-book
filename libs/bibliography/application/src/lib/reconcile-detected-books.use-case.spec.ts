import { ScanRef } from '@pick-a-book/bibliography-domain';
import { aRecord } from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { A_SCAN, aDetectedBook, aReconciler, peste } from '../testing/reconcile-scenario.js';

describe('ReconcileDetectedBooksUseCase, the statuses', () => {
  it('confirms a book the catalogue knows, with its reference form', async () => {
    const { useCase, catalog } = aReconciler();
    catalog.always([peste]);

    const result = unwrap(
      await useCase.execute({
        scanRef: A_SCAN,
        books: [aDetectedBook(0, 'La Pest', 'Albert Camus')],
      }),
    );

    expect(result.books).toStrictEqual([
      {
        position: 0,
        read: { title: 'La Pest', author: 'Albert Camus' },
        status: 'confirmed',
        confirmedBy: 'automatic',
        titleOnly: false,
        reference: { recordId: 'ark:/12148/peste', title: 'La peste', authors: ['Albert Camus'] },
      },
    ]);
  });

  it('marks a book the catalogue knows nothing like as not found', async () => {
    const { useCase, catalog } = aReconciler();
    catalog.always([peste]);

    const result = unwrap(
      await useCase.execute({
        scanRef: A_SCAN,
        books: [aDetectedBook(0, 'Titre peu lisible', 'Auteur peu lisible')],
      }),
    );

    expect(result.books.map((book) => book.status)).toStrictEqual(['not_found']);
  });
});

describe('ReconcileDetectedBooksUseCase, the statuses, part 2', () => {
  it('marks as ambiguous a title carried by works of different authors', async () => {
    const { useCase, catalog } = aReconciler();
    catalog.always([
      aRecord({
        id: 'ark:/12148/c1',
        title: 'La chute',
        authors: [{ name: 'Camus, Albert', role: 'main' }],
      }),
      aRecord({
        id: 'ark:/12148/c2',
        title: 'La chute',
        authors: [{ name: 'Autre, Auteur', role: 'main' }],
      }),
    ]);

    const result = unwrap(
      await useCase.execute({ scanRef: A_SCAN, books: [aDetectedBook(0, 'La Chute')] }),
    );

    expect(result.books[0]).toMatchObject({ status: 'ambiguous' });
  });

  it('confirms on the title alone when no author was read, and says so', async () => {
    const { useCase, catalog } = aReconciler();
    catalog.always([peste]);

    const result = unwrap(
      await useCase.execute({ scanRef: A_SCAN, books: [aDetectedBook(0, 'La Peste')] }),
    );

    expect(result.books[0]).toMatchObject({ status: 'confirmed', titleOnly: true });
  });
});

describe('ReconcileDetectedBooksUseCase, the answer', () => {
  it('answers with every book, by position', async () => {
    const { useCase, catalog } = aReconciler();
    catalog.always([peste]);

    const result = unwrap(
      await useCase.execute({
        scanRef: A_SCAN,
        books: [
          aDetectedBook(2, 'Rien', 'Personne'),
          aDetectedBook(0, 'La Peste', 'Albert Camus'),
          aDetectedBook(1, 'La Peste'),
        ],
      }),
    );

    expect(result.books.map((book) => [book.position, book.status])).toStrictEqual([
      [0, 'confirmed'],
      [1, 'confirmed'],
      [2, 'not_found'],
    ]);
  });

  it('answers an empty list without asking the catalogue anything', async () => {
    const { useCase, catalog } = aReconciler();

    const result = unwrap(await useCase.execute({ scanRef: A_SCAN, books: [] }));

    expect(result).toStrictEqual({ books: [] });
    expect(catalog.queries).toStrictEqual([]);
  });

  it('refuses an analysis reference that is not one', async () => {
    const { useCase } = aReconciler();

    const result = await useCase.execute({ scanRef: 'nope', books: [] });

    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-value' } });
  });
});

describe('ReconcileDetectedBooksUseCase, the answer, part 2', () => {
  it('keeps one attempt per book, with the catalogue that answered', async () => {
    const { useCase, catalog, repository } = aReconciler();
    catalog.always([peste]);

    await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'La Peste', 'Albert Camus')],
    });

    const [attempt] = (await repository.findByScan(unwrapScan())).flatMap((book) => book.attempts);
    expect(attempt.catalog.value).toBe('stub');
    expect(attempt.read.title).toBe('La Peste');
  });
});

function unwrapScan(): ScanRef {
  return unwrap(ScanRef.of(A_SCAN));
}
