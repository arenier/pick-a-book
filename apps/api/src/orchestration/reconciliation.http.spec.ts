import { describe, expect, it } from 'vitest';

import { reconciliationOf } from './testing/reconciliation-body';
import { aRunningReconciliationApi } from './testing/running-reconciliation-api';

/**
 * The reconciliation over real HTTP (specs/003, contracts/reconciliation-api.md): the stub scanner
 * detects four books, the stub catalogue judges them, Postgres keeps the verdicts.
 */
const STATUSES = ['confirmed', 'confirmed', 'confirmed', 'not_found'];

describe('POST and GET /shelf-photos/{id}/reconciliation, the states', () => {
  const api = aRunningReconciliationApi();

  it('reconciles every book of the analysis, by position, with what was read left intact', async () => {
    const id = await api.completedScan();

    const response = await api.reconcile(id);
    const body = await reconciliationOf(response);

    expect(response.status).toBe(200);
    expect(body.books.map((book) => book.status)).toStrictEqual(STATUSES);
    expect(body.books.map((book) => book.position)).toStrictEqual([0, 1, 2, 3]);
    expect(body.books[0]).toMatchObject({
      read: { title: "L'Amant", author: 'Marguerite Duras' },
      status: 'confirmed',
      confirmedBy: 'automatic',
      titleOnly: false,
    });
    expect(body.books[3]).toStrictEqual({
      position: 3,
      read: { title: 'Titre peu lisible', author: 'Auteur peu lisible' },
      status: 'not_found',
    });
  });

  it('answers the kept state by GET, with nothing pending after a POST', async () => {
    const id = await api.completedScan();
    const posted = await reconciliationOf(await api.reconcile(id));

    const read = await reconciliationOf(await api.read(id));

    expect(read).toStrictEqual(posted);
  });

  it('answers pending for every book when nothing was reconciled yet', async () => {
    const id = await api.completedScan();

    const body = await reconciliationOf(await api.read(id));

    expect(body.books.map((book) => book.status)).toStrictEqual([
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });
});
