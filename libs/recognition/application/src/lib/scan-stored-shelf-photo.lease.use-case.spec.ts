import {
  OwnerId,
  ShelfScanId,
  type DetectedBook,
  type ShelfScanFailed,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { ok, unwrap, type Result } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { InMemoryShelfPhotoStorage } from './testing/in-memory-shelf-photo-storage.js';
import { InMemoryShelfScanRepository } from './testing/in-memory-shelf-scan-repository.js';
import { ScanStoredShelfPhotoUseCase } from './scan-stored-shelf-photo.use-case.js';
import { StoreShelfPhotoUseCase } from './store-shelf-photo.use-case.js';
import { aJpeg, books, policy } from './testing/scan-fixtures.js';

/**
 * An analysis that outlives its lease (specs/002-upload-history, research.md §8): a second one is
 * allowed to start, and the first, when it ends at last, closes its own attempt — not the
 * second's, which is still running and still holds the scan.
 */
const LEASE = policy.lease;

/** Lets the use cases run up to the scanner they wait on. */
const settled = async () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/** A scanner that answers when told to, so that two analyses can overlap. */
class GatedScanner implements ShelfScannerPort {
  private readonly waiting: (() => void)[] = [];

  async scan(): Promise<Result<DetectedBook[], ShelfScanFailed>> {
    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });

    return ok(books);
  }

  open(): void {
    this.waiting.forEach((release) => {
      release();
    });
  }
}

describe('ScanStoredShelfPhotoUseCase, an analysis that outlived its lease', () => {
  it('leaves the attempt of the analysis that started after it open', async () => {
    let now = new Date('2026-10-04T10:00:00Z');
    const repository = new InMemoryShelfScanRepository(() => now);
    const storage = new InMemoryShelfPhotoStorage();
    const owner = unwrap(OwnerId.of('default'));
    const { id } = unwrap(
      await new StoreShelfPhotoUseCase(owner, storage, repository).execute(aJpeg),
    );
    const slow = new GatedScanner();
    const first = new ScanStoredShelfPhotoUseCase(owner, storage, repository, slow, policy);
    const running = first.execute({ id });
    await settled();
    now = new Date(now.getTime() + LEASE + 1);
    const second = new ScanStoredShelfPhotoUseCase(
      owner,
      storage,
      repository,
      new GatedScanner(),
      policy,
    );
    void second.execute({ id });
    await settled();

    slow.open();
    await running;

    const open = repository.attempts.filter((attempt) => attempt.finishedAt === undefined);
    expect(repository.attempts).toHaveLength(2);
    expect(open).toHaveLength(1);
    expect(open[0]?.scanId.equals(unwrap(ShelfScanId.of(id)))).toBe(true);
  });
});
