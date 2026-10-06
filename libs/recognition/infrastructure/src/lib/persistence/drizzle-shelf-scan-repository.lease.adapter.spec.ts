import type { ScanAttemptPolicy } from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aMigratedRepository, aNewScan, books, ownerId } from '../testing/test-repository.js';

/**
 * An analysis that outlives its lease (specs/002-upload-history, research.md §8), against
 * Postgres: A is still running when its lease runs out, B starts, then A ends. A closes its own
 * attempt, not B's — B still holds the scan, and a third analysis must still be refused.
 */
const policy = {
  dailyLimit: 50,
  timeZone: 'Europe/Paris',
  lease: 300_000,
} satisfies ScanAttemptPolicy;

const anOwner = () => ownerId(`lease-${crypto.randomUUID()}`);

describe('DrizzleShelfScanRepositoryAdapter, an analysis that outlived its lease', () => {
  const { pool, repository } = aMigratedRepository();

  async function aScanWithTwoAttempts() {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);
    const first = unwrap(await repository.startAttempt(scan.id, policy));
    await pool.query(
      "update scan_attempts set started_at = now() - interval '6 minutes' where upload_id = $1",
      [scan.id.value],
    );
    const second = unwrap(await repository.startAttempt(scan.id, policy));

    return { scan, first, second };
  }

  const openAttempts = async (uploadId: string) =>
    pool.query<{ id: string }>(
      'select id from scan_attempts where upload_id = $1 and finished_at is null',
      [uploadId],
    );

  it('answers a distinct attempt each time', async () => {
    const { first, second } = await aScanWithTwoAttempts();

    expect(first.equals(second)).toBe(false);
  });

  it('closes its own attempt when it fails, and leaves the next one open', async () => {
    const { scan, first, second } = await aScanWithTwoAttempts();

    await repository.markFailed(scan.id, first);

    expect((await openAttempts(scan.id.value)).rows).toStrictEqual([{ id: second.value }]);
  });

  it('closes its own attempt when it completes, and leaves the next one open', async () => {
    const { scan, first, second } = await aScanWithTwoAttempts();

    await repository.markCompleted(scan.id, first, books);

    expect((await openAttempts(scan.id.value)).rows).toStrictEqual([{ id: second.value }]);
  });
});
