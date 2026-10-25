import { describe, expect, it } from 'vitest';

import { reconciliationOf } from './testing/reconciliation-body';
import { aRunningReconciliationApi } from './testing/running-reconciliation-api';

describe('two reconciliations of one analysis at once (research §3)', () => {
  const api = aRunningReconciliationApi();

  it('answers 200 to both, with the same state, and keeps one final attempt per book', async () => {
    const id = await api.completedScan();

    const [first, second] = await Promise.all([api.reconcile(id), api.reconcile(id)]);

    expect([first.status, second.status]).toStrictEqual([200, 200]);
    await expect(reconciliationOf(first)).resolves.toStrictEqual(await reconciliationOf(second));
    const { rows } = await api.pool.query<{ finals: string }>(
      `select count(*) as finals from reconciliation_attempts
       where scan_ref = $1 and verdict <> 'not_verified' group by position`,
      [id],
    );
    expect(rows.map((row) => row.finals)).toStrictEqual(['1', '1', '1', '1', '1']);
  });
});

describe('what the responses leave out (FR-018, FR-021)', () => {
  const api = aRunningReconciliationApi();

  it('carries no score, no catalogue, no step, no cause and no reading confidence', async () => {
    const id = await api.completedScan();

    const posted = JSON.stringify(await (await api.reconcile(id)).json());
    const read = JSON.stringify(await (await api.read(id)).json());

    for (const body of [posted, read]) {
      expect(body).not.toMatch(
        /"(score|titleScore|authorScore|reconciliationScore|catalog|step|cause|confidence)"/u,
      );
    }
  });
});
