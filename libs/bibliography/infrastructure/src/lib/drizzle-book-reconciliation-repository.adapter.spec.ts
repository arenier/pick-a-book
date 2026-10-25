import {
  aBookRef,
  aConfirmed,
  aMatch,
  anAttempt,
  anAmbiguous,
  aNotFound,
  aRecord,
  aReading,
} from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aMigratedRepository } from './testing/test-repository.js';

const freshScan = () => crypto.randomUUID();

describe('DrizzleBookReconciliationRepositoryAdapter, round trips', () => {
  const { repository } = aMigratedRepository();

  it('keeps a confirmed attempt: what was read, the catalogue, the step, the record', async () => {
    const bookRef = aBookRef(2, freshScan());
    const record = aRecord({ id: 'ark:/12148/cb1', raw: '<record id="1"/>', format: 'unimarc' });
    const attempt = anAttempt(bookRef, aMatch(aConfirmed(record), 'title_and_author', 0.75), {
      read: aReading('La Pest'),
    });

    unwrap(await repository.saveAttempt(attempt));
    const found = await repository.findBook(bookRef);

    expect(found?.state).toMatchObject({
      status: 'confirmed',
      confirmedBy: 'automatic',
      record: { id: { value: 'ark:/12148/cb1' }, raw: '<record id="1"/>', format: 'unimarc' },
    });
    const saved = found?.attempts[0];
    expect(saved?.read.title).toBe('La Pest');
    expect(saved?.read.author).toBeUndefined();
    expect(saved?.catalog.value).toBe('stub');
    expect(saved?.attemptedAt).toStrictEqual(attempt.attemptedAt);
    expect(saved?.result).toMatchObject({ kind: 'matched', step: 'title_and_author' });
  });

  it('keeps an ambiguous attempt with its candidates in rank order', async () => {
    const bookRef = aBookRef(0, freshScan());
    const second = aRecord({ id: 'ark:/12148/cb2', title: 'La chute' });
    const first = aRecord({ id: 'ark:/12148/cb1', title: 'La chute' });
    unwrap(
      await repository.saveAttempt(
        anAttempt(bookRef, aMatch(anAmbiguous([first, second]), 'title_only')),
      ),
    );

    const found = await repository.findBook(bookRef);

    expect(found?.state).toMatchObject({
      status: 'ambiguous',
      candidates: [{ id: { value: 'ark:/12148/cb1' } }, { id: { value: 'ark:/12148/cb2' } }],
    });
  });
});

describe('DrizzleBookReconciliationRepositoryAdapter, the other verdicts', () => {
  const { repository } = aMigratedRepository();

  it('keeps a not found attempt, whose step is none', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(await repository.saveAttempt(anAttempt(bookRef, aMatch(aNotFound(), null, 0))));

    const found = await repository.findBook(bookRef);

    expect(found?.state.status).toBe('not_found');
    expect(found?.attempts[0]?.result).toMatchObject({ kind: 'matched', step: null });
  });

  it('keeps a not verified attempt with its cause', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(
      await repository.saveAttempt(anAttempt(bookRef, { kind: 'not_verified', cause: 'timeout' })),
    );

    const found = await repository.findBook(bookRef);

    expect(found?.state.status).toBe('not_verified');
    expect(found?.attempts[0]?.result).toStrictEqual({ kind: 'not_verified', cause: 'timeout' });
  });

  it('knows nothing of a book never reconciled', async () => {
    await expect(repository.findBook(aBookRef(0, freshScan()))).resolves.toBeUndefined();
  });
});
