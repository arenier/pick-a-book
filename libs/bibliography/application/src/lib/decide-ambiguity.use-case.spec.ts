import { ScanRef, ShelfBookRef } from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { InMemoryBookReconciliationRepository } from '../testing/in-memory-book-reconciliation-repository.js';
import { A_SCAN, aDetectedBook, aReconciler, peste } from '../testing/reconcile-scenario.js';
import { DecideAmbiguityUseCase } from './decide-ambiguity.use-case.js';
import { aRecord } from '@pick-a-book/bibliography-domain/testing';

const chute = (id: string, author: string) =>
  aRecord({ id: `ark:/12148/${id}`, title: 'La chute', authors: [{ name: author, role: 'main' }] });
const CHUTES = [chute('chute-1', 'Camus, Albert'), chute('chute-2', 'Moreau, Julie')];

/** An analysis whose single book is ambiguous, reconciled over the doubles. */
async function anAmbiguousBook() {
  const { useCase, catalog, repository } = aReconciler();
  catalog.always(CHUTES);
  await useCase.execute({ scanRef: A_SCAN, books: [aDetectedBook(0, 'La Chute')] });

  return { repository, decide: new DecideAmbiguityUseCase(repository) };
}

const command = (decision: { choice: 'candidate'; recordId: string } | { choice: 'none' }) => ({
  scanRef: A_SCAN,
  position: 0,
  decision,
});

describe('DecideAmbiguityUseCase, a candidate chosen', () => {
  it('confirms the book with the record chosen, by the user', async () => {
    const { decide } = await anAmbiguousBook();

    const result = unwrap(
      await decide.execute(command({ choice: 'candidate', recordId: 'ark:/12148/chute-2' })),
    );

    expect(result).toStrictEqual({
      position: 0,
      read: { title: 'La Chute' },
      status: 'confirmed',
      confirmedBy: 'user',
      titleOnly: true,
      reference: { recordId: 'ark:/12148/chute-2', title: 'La chute', authors: ['Julie Moreau'] },
    });
  });

  it('keeps the decision, beside the attempt that was ambiguous', async () => {
    const { decide, repository } = await anAmbiguousBook();

    await decide.execute(command({ choice: 'candidate', recordId: 'ark:/12148/chute-1' }));

    const kept = await repository.findBook(bookRef());
    expect(kept?.decision).toMatchObject({ kind: 'chosen' });
    expect(kept?.attempts).toHaveLength(1);
  });
});

describe('DecideAmbiguityUseCase, none of the candidates', () => {
  it('makes the book not found', async () => {
    const { decide } = await anAmbiguousBook();

    const result = unwrap(await decide.execute(command({ choice: 'none' })));

    expect(result).toMatchObject({ status: 'not_found', read: { title: 'La Chute' } });
  });
});

describe('DecideAmbiguityUseCase, what it refuses', () => {
  it('refuses a candidate the book does not have', async () => {
    const { decide } = await anAmbiguousBook();

    const result = await decide.execute(
      command({ choice: 'candidate', recordId: 'ark:/12148/elsewhere' }),
    );

    expect(result).toMatchObject({ ok: false, error: { kind: 'unknown-candidate' } });
  });

  it('refuses a second decision', async () => {
    const { decide } = await anAmbiguousBook();
    await decide.execute(command({ choice: 'none' }));

    const result = await decide.execute(command({ choice: 'none' }));

    expect(result).toMatchObject({ ok: false, error: { kind: 'book-not-ambiguous' } });
  });

  it('refuses a book that is not ambiguous', async () => {
    const { useCase, catalog, repository } = aReconciler();
    catalog.always([peste]);
    await useCase.execute({ scanRef: A_SCAN, books: [aDetectedBook(0, 'La Peste')] });

    const result = await new DecideAmbiguityUseCase(repository).execute(
      command({ choice: 'none' }),
    );

    expect(result).toMatchObject({ ok: false, error: { kind: 'book-not-ambiguous' } });
  });

  it('refuses a book that was never reconciled', async () => {
    const result = await new DecideAmbiguityUseCase(
      new InMemoryBookReconciliationRepository(),
    ).execute(command({ choice: 'none' }));

    expect(result).toMatchObject({ ok: false, error: { kind: 'book-reconciliation-not-found' } });
  });

  it('refuses a reference that is not an analysis', async () => {
    const { decide } = await anAmbiguousBook();

    const result = await decide.execute({ ...command({ choice: 'none' }), scanRef: 'nope' });

    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-value' } });
  });
});

function bookRef() {
  return unwrap(ShelfBookRef.of(unwrap(ScanRef.of(A_SCAN)), 0));
}
