import {
  DailyScanQuotaExceeded,
  ShelfScanAlreadyProcessed,
  ShelfScanId,
  ShelfScanInProgress,
  ShelfScanNotFound,
  type ScanAttemptPolicy,
} from '@pick-a-book/recognition-domain';
import { err, ok } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import type { DrizzleShelfScanRepositoryAdapter } from './drizzle-shelf-scan-repository.adapter.js';
import { aMigratedRepository, aNewScan, books, ownerId } from './testing/test-repository.js';

/**
 * The reservation of an analysis against Postgres (specs/002-upload-history, research.md §8).
 * Each test is its own owner, which is what the cap counts per: runs never see each other's
 * attempts. The clock is the database's, so the specs move attempts in time with SQL.
 */
const policy = {
  dailyLimit: 50,
  timeZone: 'Europe/Paris',
  lease: 300_000,
} satisfies ScanAttemptPolicy;

const anOwner = () => ownerId(`attempts-${crypto.randomUUID()}`);

/** The start of today in Paris, as an instant — what the cap counts from. */
const PARIS_MIDNIGHT =
  "(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')";

describe('DrizzleShelfScanRepositoryAdapter, reserving an attempt', () => {
  const { pool, repository } = aMigratedRepository();

  it('inserts an open attempt for the scan', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);

    await expect(repository.startAttempt(scan.id, policy)).resolves.toStrictEqual(ok());

    const { rows } = await pool.query<{ finished_at: Date | null }>(
      'select finished_at from scan_attempts where upload_id = $1',
      [scan.id.value],
    );
    expect(rows).toStrictEqual([{ finished_at: null }]);
  });

  it('answers ShelfScanNotFound for a scan it never stored', async () => {
    const id = ShelfScanId.generate();

    await expect(repository.startAttempt(id, policy)).resolves.toStrictEqual(
      err(new ShelfScanNotFound(id.value)),
    );
  });

  it('answers ShelfScanAlreadyProcessed for a scan that has its books', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);
    await repository.markCompleted(scan.id, books);

    await expect(repository.startAttempt(scan.id, policy)).resolves.toStrictEqual(
      err(new ShelfScanAlreadyProcessed(scan.id)),
    );
  });
});

describe('DrizzleShelfScanRepositoryAdapter, the lease of an attempt', () => {
  const { pool, repository } = aMigratedRepository();

  it('answers ShelfScanInProgress while an attempt opened under 5 minutes ago is still open', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);
    await repository.startAttempt(scan.id, policy);

    await expect(repository.startAttempt(scan.id, policy)).resolves.toStrictEqual(
      err(new ShelfScanInProgress(scan.id)),
    );
  });

  // The instance that held it may have died: the lease is what unblocks the scan.
  it('lets an attempt open for more than 5 minutes go', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);
    await repository.startAttempt(scan.id, policy);
    await pool.query(
      "update scan_attempts set started_at = now() - interval '6 minutes' where upload_id = $1",
      [scan.id.value],
    );

    await expect(repository.startAttempt(scan.id, policy)).resolves.toStrictEqual(ok());
  });

  it('counts the lease from the policy, not from a constant', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);
    await repository.startAttempt(scan.id, policy);
    await pool.query(
      "update scan_attempts set started_at = now() - interval '2 minutes' where upload_id = $1",
      [scan.id.value],
    );

    await expect(
      repository.startAttempt(scan.id, { ...policy, lease: 60_000 }),
    ).resolves.toStrictEqual(ok());
  });
});

const capped = { ...policy, dailyLimit: 2 } satisfies ScanAttemptPolicy;

/** Three pending scans of one owner, the first two already analysed today: the cap is reached. */
async function aDayAtTheCap(repository: DrizzleShelfScanRepositoryAdapter) {
  const owner = anOwner();
  const [first, second, third] = [aNewScan(owner), aNewScan(owner), aNewScan(owner)];
  await Promise.all([first, second, third].map(async (scan) => repository.createPending(scan)));
  await repository.startAttempt(first.id, capped);
  await repository.startAttempt(second.id, capped);

  return { first, second, third };
}

describe('DrizzleShelfScanRepositoryAdapter, the daily cap', () => {
  const { pool, repository } = aMigratedRepository();

  it('answers DailyScanQuotaExceeded once the limit is reached', async () => {
    const { third } = await aDayAtTheCap(repository);

    await expect(repository.startAttempt(third.id, capped)).resolves.toStrictEqual(
      err(new DailyScanQuotaExceeded(2)),
    );
  });

  it('leaves the scan it refused as it was, with no attempt', async () => {
    const { third } = await aDayAtTheCap(repository);
    await repository.startAttempt(third.id, capped);

    const { rows } = await pool.query('select 1 from scan_attempts where upload_id = $1', [
      third.id.value,
    ]);
    await expect(repository.get(third.id)).resolves.toMatchObject({ status: 'pending' });
    expect(rows).toHaveLength(0);
  });

  it("does not count another owner's attempts", async () => {
    await aDayAtTheCap(repository);
    const other = aNewScan(anOwner());
    await repository.createPending(other);

    await expect(repository.startAttempt(other.id, capped)).resolves.toStrictEqual(ok());
  });
});

describe('DrizzleShelfScanRepositoryAdapter, the turn of the day in Paris', () => {
  const { pool, repository } = aMigratedRepository();

  /** Moves the two attempts of the day by `shift` from midnight in Paris. */
  async function shiftAttempts(shift: string, ...ids: readonly ShelfScanId[]) {
    await pool.query(
      `update scan_attempts set started_at = ${PARIS_MIDNIGHT} + interval '${shift}'
       where upload_id = any($1)`,
      [ids.map((id) => id.value)],
    );
  }

  it("does not count yesterday's attempts", async () => {
    const { first, second, third } = await aDayAtTheCap(repository);
    await shiftAttempts('-30 minutes', first.id, second.id);

    await expect(repository.startAttempt(third.id, capped)).resolves.toStrictEqual(ok());
  });

  // 00:30 in Paris is still yesterday in UTC: the day is Paris's, not UTC's.
  it('counts an attempt made just after midnight in Paris', async () => {
    const { first, second, third } = await aDayAtTheCap(repository);
    await shiftAttempts('30 minutes', first.id, second.id);

    await expect(repository.startAttempt(third.id, capped)).resolves.toStrictEqual(
      err(new DailyScanQuotaExceeded(2)),
    );
  });
});

describe('DrizzleShelfScanRepositoryAdapter, concurrent reservations', () => {
  const { repository } = aMigratedRepository();

  // The advisory lock: without it, they all read a count below the cap and all are let in.
  it('lets exactly as many simultaneous analyses through as the cap allows', async () => {
    const owner = anOwner();
    const scans = Array.from({ length: 8 }, () => aNewScan(owner));
    await Promise.all(scans.map(async (scan) => repository.createPending(scan)));
    const twoADay = { ...policy, dailyLimit: 2 } satisfies ScanAttemptPolicy;

    const answers = await Promise.all(
      scans.map(async (scan) => repository.startAttempt(scan.id, twoADay)),
    );

    expect(answers.filter((answer) => answer.ok)).toHaveLength(2);
    expect(answers.filter((answer) => !answer.ok)).toStrictEqual(
      Array.from({ length: 6 }, () => err(new DailyScanQuotaExceeded(2))),
    );
  });

  it('lets one of two simultaneous analyses of the same scan through', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);

    const answers = await Promise.all([
      repository.startAttempt(scan.id, policy),
      repository.startAttempt(scan.id, policy),
    ]);

    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toStrictEqual([
      err(new ShelfScanInProgress(scan.id)),
    ]);
  });
});

describe('DrizzleShelfScanRepositoryAdapter, closing the attempt', () => {
  const { pool, repository } = aMigratedRepository();

  const finishedAt = async (id: ShelfScanId) =>
    pool.query<{ finished_at: Date | null }>(
      'select finished_at from scan_attempts where upload_id = $1',
      [id.value],
    );

  it('fills finished_at when the scan is marked completed', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);
    await repository.startAttempt(scan.id, policy);

    await repository.markCompleted(scan.id, books);

    expect((await finishedAt(scan.id)).rows[0]?.finished_at).toBeInstanceOf(Date);
  });

  it('fills finished_at when the scan is marked failed', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);
    await repository.startAttempt(scan.id, policy);

    await repository.markFailed(scan.id);

    expect((await finishedAt(scan.id)).rows[0]?.finished_at).toBeInstanceOf(Date);
  });
});

// specs/002-upload-history, US3, FR-011: a scan that has no books — it failed — can be run again,
// and only a scan that has them is final.
describe('DrizzleShelfScanRepositoryAdapter, running a failed scan again', () => {
  const { repository } = aMigratedRepository();

  /** A scan whose analysis failed once, its attempt closed. */
  async function aFailedScan() {
    const scan = aNewScan(anOwner());
    await repository.createPending(scan);
    await repository.startAttempt(scan.id, policy);
    await repository.markFailed(scan.id);

    return scan;
  }

  it('reserves an attempt for it', async () => {
    const scan = await aFailedScan();

    await expect(repository.startAttempt(scan.id, policy)).resolves.toStrictEqual(ok());
  });

  it('completes it, with the books of the new analysis', async () => {
    const scan = await aFailedScan();
    await repository.startAttempt(scan.id, policy);

    await expect(repository.markCompleted(scan.id, books)).resolves.toStrictEqual(ok());

    await expect(repository.get(scan.id)).resolves.toMatchObject({
      status: 'completed',
      detectedBooks: books,
    });
  });

  it('keeps it failed when the new analysis fails too', async () => {
    const scan = await aFailedScan();
    await repository.startAttempt(scan.id, policy);

    await expect(repository.markFailed(scan.id)).resolves.toStrictEqual(ok());

    await expect(repository.get(scan.id)).resolves.toMatchObject({ status: 'failed' });
  });

  it('is no longer possible once it has its books: they are final', async () => {
    const scan = await aFailedScan();
    await repository.startAttempt(scan.id, policy);
    await repository.markCompleted(scan.id, books);

    await expect(repository.startAttempt(scan.id, policy)).resolves.toStrictEqual(
      err(new ShelfScanAlreadyProcessed(scan.id)),
    );
    await expect(repository.markFailed(scan.id)).resolves.toStrictEqual(
      err(new ShelfScanAlreadyProcessed(scan.id)),
    );
  });

  // Two tabs, a double click: one analysis is paid for, the other is told one is running.
  it('lets one of two simultaneous relaunches through', async () => {
    const scan = await aFailedScan();

    const answers = await Promise.all([
      repository.startAttempt(scan.id, policy),
      repository.startAttempt(scan.id, policy),
    ]);

    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toStrictEqual([
      err(new ShelfScanInProgress(scan.id)),
    ]);
  });
});
