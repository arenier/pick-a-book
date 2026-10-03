import {
  ShelfScanAlreadyProcessed,
  ShelfScanInProgress,
  type ScanAttemptPolicy,
} from '@pick-a-book/recognition-domain';
import { err, ok } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import type { DrizzleShelfScanRepositoryAdapter } from './drizzle-shelf-scan-repository.adapter.js';
import { aMigratedRepository, aNewScan, books, ownerId } from './testing/test-repository.js';

const policy = {
  dailyLimit: 50,
  timeZone: 'Europe/Paris',
  lease: 300_000,
} satisfies ScanAttemptPolicy;

const anOwner = () => ownerId(`relaunch-${crypto.randomUUID()}`);

// specs/002-upload-history, US3, FR-011: a scan that has no books — it failed — can be run again,
// and only a scan that has them is final.
/** A scan whose analysis failed once, its attempt closed. */
async function aFailedScan(repository: DrizzleShelfScanRepositoryAdapter) {
  const scan = aNewScan(anOwner());
  await repository.createPending(scan);
  await repository.startAttempt(scan.id, policy);
  await repository.markFailed(scan.id);

  return scan;
}

describe('DrizzleShelfScanRepositoryAdapter, running a failed scan again', () => {
  const { repository } = aMigratedRepository();

  it('reserves an attempt for it', async () => {
    const scan = await aFailedScan(repository);

    await expect(repository.startAttempt(scan.id, policy)).resolves.toStrictEqual(ok());
  });

  it('completes it, with the books of the new analysis', async () => {
    const scan = await aFailedScan(repository);
    await repository.startAttempt(scan.id, policy);

    await expect(repository.markCompleted(scan.id, books)).resolves.toStrictEqual(ok());

    await expect(repository.get(scan.id)).resolves.toMatchObject({
      status: 'completed',
      detectedBooks: books,
    });
  });

  it('keeps it failed when the new analysis fails too', async () => {
    const scan = await aFailedScan(repository);
    await repository.startAttempt(scan.id, policy);

    await expect(repository.markFailed(scan.id)).resolves.toStrictEqual(ok());

    await expect(repository.get(scan.id)).resolves.toMatchObject({ status: 'failed' });
  });
});

describe('DrizzleShelfScanRepositoryAdapter, a scan that ended with its books', () => {
  const { repository } = aMigratedRepository();

  it('is no longer possible once it has its books: they are final', async () => {
    const scan = await aFailedScan(repository);
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
    const scan = await aFailedScan(repository);

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
