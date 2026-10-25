import { describe, expect, it } from 'vitest';

import { errorBodyOf } from '../http/testing/error-body';
import { reconciliationOf } from './testing/reconciliation-body';
import { aRunningReconciliationApi } from './testing/running-reconciliation-api';

/** « La Chute », read without any author, is the ambiguous book of the stub scanner. */
const AMBIGUOUS = 4;
const CONFIRMED = 0;

const decisionPath = (id: string, position: number | string) =>
  `/shelf-photos/${id}/books/${position}/decision`;

describe('POST /shelf-photos/{id}/books/{position}/decision, lifting an ambiguity (FR-010)', () => {
  const api = aRunningReconciliationApi();

  /** An analysis reconciled, and the candidates of its ambiguous book. */
  async function reconciled() {
    const id = await api.completedScan();
    const { books } = await reconciliationOf(await api.reconcile(id));
    const book = books[AMBIGUOUS];

    return { id, candidates: book.status === 'ambiguous' ? book.candidates : [] };
  }

  it('confirms the book with the candidate chosen, by the user', async () => {
    const { id, candidates } = await reconciled();

    const response = await api.post(decisionPath(id, AMBIGUOUS), {
      choice: 'candidate',
      recordId: candidates[1].recordId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      position: AMBIGUOUS,
      status: 'confirmed',
      confirmedBy: 'user',
      reference: { recordId: candidates[1].recordId },
    });
  });

  it('carries no score, no catalogue, no step, no cause and no confidence either (FR-018)', async () => {
    const { id, candidates } = await reconciled();

    const response = await api.post(decisionPath(id, AMBIGUOUS), {
      choice: 'candidate',
      recordId: candidates[0].recordId,
    });

    expect(JSON.stringify(await response.json())).not.toMatch(
      /"(score|titleScore|authorScore|reconciliationScore|catalog|step|cause|confidence)"/u,
    );
  });

  it('is kept: the state read afterwards shows the decision', async () => {
    const { id, candidates } = await reconciled();
    await api.post(decisionPath(id, AMBIGUOUS), {
      choice: 'candidate',
      recordId: candidates[0].recordId,
    });

    const { books } = await reconciliationOf(await api.read(id));

    expect(books[AMBIGUOUS]).toMatchObject({ status: 'confirmed', confirmedBy: 'user' });
  });

  it('makes the book not found when none of the candidates is it', async () => {
    const { id } = await reconciled();

    const response = await api.post(decisionPath(id, AMBIGUOUS), { choice: 'none' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'not_found' });
  });
});

describe('POST /shelf-photos/{id}/books/{position}/decision, what it refuses', () => {
  const api = aRunningReconciliationApi();

  it.each([
    ['no body', undefined],
    ['an unknown choice', { choice: 'maybe' }],
    ['a candidate without a record', { choice: 'candidate' }],
    ['a record that is not text', { choice: 'candidate', recordId: 4 }],
  ])('answers 400 for %s', async (_name, body) => {
    const id = await api.completedScan();
    await api.reconcile(id);

    expect((await api.post(decisionPath(id, AMBIGUOUS), body)).status).toBe(400);
  });

  it.each(['abc', '-1', '1.5'])('answers 400 for the position %s', async (position) => {
    const id = await api.completedScan();

    expect((await api.post(decisionPath(id, position), { choice: 'none' })).status).toBe(400);
  });

  it('answers 400 UNKNOWN_CANDIDATE for a record that is not a candidate', async () => {
    const id = await api.completedScan();
    await api.reconcile(id);

    const response = await api.post(decisionPath(id, AMBIGUOUS), {
      choice: 'candidate',
      recordId: 'ark:/stub/elsewhere',
    });

    expect(response.status).toBe(400);
    await expect(errorBodyOf(response)).resolves.toMatchObject({ code: 'UNKNOWN_CANDIDATE' });
  });
});

describe('POST /shelf-photos/{id}/books/{position}/decision, books that cannot be decided', () => {
  const api = aRunningReconciliationApi();

  it('answers 404 for an unknown analysis', async () => {
    const response = await api.post(decisionPath('5d6b8d7e-0f1a-4c2b-9e3d-7a8b9c0d1e2f', 0), {
      choice: 'none',
    });

    expect(response.status).toBe(404);
  });

  it('answers 404 for a position outside the list', async () => {
    const id = await api.completedScan();
    await api.reconcile(id);

    expect((await api.post(decisionPath(id, 40), { choice: 'none' })).status).toBe(404);
  });

  it('answers 404 for a book never reconciled', async () => {
    const id = await api.completedScan();

    expect((await api.post(decisionPath(id, AMBIGUOUS), { choice: 'none' })).status).toBe(404);
  });

  it('answers 409 BOOK_NOT_AMBIGUOUS for a book that is confirmed', async () => {
    const id = await api.completedScan();
    await api.reconcile(id);

    const response = await api.post(decisionPath(id, CONFIRMED), { choice: 'none' });

    expect(response.status).toBe(409);
    await expect(errorBodyOf(response)).resolves.toMatchObject({ code: 'BOOK_NOT_AMBIGUOUS' });
  });

  it('answers 409 BOOK_NOT_AMBIGUOUS when the same decision is replayed', async () => {
    const id = await api.completedScan();
    await api.reconcile(id);
    await api.post(decisionPath(id, AMBIGUOUS), { choice: 'none' });

    const response = await api.post(decisionPath(id, AMBIGUOUS), { choice: 'none' });

    expect(response.status).toBe(409);
  });
});
