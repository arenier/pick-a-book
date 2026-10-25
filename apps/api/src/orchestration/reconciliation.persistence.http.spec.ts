import { describe, expect, it } from 'vitest';

import { reconciliationOf } from './testing/reconciliation-body';
import { aRunningReconciliationApi } from './testing/running-reconciliation-api';

interface KeptBook {
  readonly position: number;
  readonly verdict: string;
  readonly query_title: string;
  readonly query_author: string | null;
  readonly attempted_at: Date | null;
  readonly record_id: string | null;
  readonly title: string | null;
  readonly raw: string | null;
}

type Api = ReturnType<typeof aRunningReconciliationApi>;

const keptOf = async (api: Api, id: string) => {
  const { rows } = await api.pool.query<KeptBook>(
    `select a.position, a.verdict, a.query_title, a.query_author, a.attempted_at,
            c.record_id, c.title, c.raw
       from reconciliation_attempts a
       left join reconciliation_candidates c on c.attempt_id = a.id and c.rank = 1
      where a.scan_ref = $1 order by a.position`,
    [id],
  );

  return rows;
};

/**
 * US3, from the database alone (specs/003, FR-012, FR-013, SC-005): the result of each book is
 * found again afterwards, with the notice as received, without going through the screen.
 */
describe('what is kept of a reconciliation (US3)', () => {
  const api = aRunningReconciliationApi();

  it('keeps, for each book, its status, the date and what was read as received', async () => {
    const id = await api.completedScan();
    await api.reconcile(id);

    const rows = await keptOf(api, id);

    expect(rows.map((row) => row.verdict)).toStrictEqual([
      'confirmed',
      'confirmed',
      'confirmed',
      'not_found',
      'ambiguous',
    ]);
    expect(rows.every((row) => row.attempted_at instanceof Date)).toBe(true);
    expect(rows[0]).toMatchObject({ query_title: "L'Amant", query_author: 'Marguerite Duras' });
    expect(rows[4]?.query_author).toBeNull();
  });

  it('keeps, for a confirmed book, the ARK, the reference form and the notice as received', async () => {
    const id = await api.completedScan();
    const body = await reconciliationOf(await api.reconcile(id));

    const [first] = await keptOf(api, id);

    expect(first.record_id).toMatch(/^ark:\//u);
    expect(first.title).toContain('');
    expect(first.raw?.length).toBeGreaterThan(0);
    expect(body.books[0]).toMatchObject({ reference: { recordId: first.record_id } });
  });
});

describe('what is kept of a reconciliation (US3), part 2', () => {
  const api = aRunningReconciliationApi();

  it('leaves the books of the recognition identical (FR-013)', async () => {
    const id = await api.completedScan();
    const before = await (await api.get(`/shelf-photos/${id}`)).json();

    await api.reconcile(id);
    const after = await (await api.get(`/shelf-photos/${id}`)).json();

    expect(after).toStrictEqual(before);
  });

  it('writes no attempt for a second POST nor for a GET', async () => {
    const id = await api.completedScan();
    await api.reconcile(id);
    const count = async () => (await keptOf(api, id)).length;
    const afterFirst = await count();

    await api.reconcile(id);
    await api.read(id);

    await expect(count()).resolves.toBe(afterFirst);
  });
});
