import {
  DailyScanQuotaExceeded,
  ShelfScanId,
  ShelfScanInProgress,
  type ScanAttemptPolicy,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { aStoredPhoto, books, failing, policy, scanning } from '../testing/scan-fixtures.js';
import { InMemoryShelfPhotoStorage } from '../../testing/in-memory-shelf-photo-storage.js';

// Reserved before anything is read or paid for (specs/002-upload-history, research.md §8).
describe('ScanStoredShelfPhotoUseCase, reserving the attempt', () => {
  it('reserves it before reading the photo and before calling the scanner', async () => {
    const scanner = scanning(books);
    const { id, storage, repository, useCase } = await aStoredPhoto(scanner);
    const reserve = vi.spyOn(repository, 'startAttempt');
    const read = vi.spyOn(storage, 'retrieve');
    const scan = vi.spyOn(scanner, 'scan');

    await useCase.execute({ id });

    expect(reserve).toHaveBeenCalledBefore(read);
    expect(reserve).toHaveBeenCalledBefore(scan);
  });
});

describe('ScanStoredShelfPhotoUseCase, refusing the attempt', () => {
  it('hands the repository the policy it was built with', async () => {
    const own = {
      dailyLimit: 7,
      timeZone: 'Europe/Paris',
      lease: 60_000,
    } satisfies ScanAttemptPolicy;
    const { id, repository, useCase } = await aStoredPhoto(scanning(books), { policy: own });
    const reserve = vi.spyOn(repository, 'startAttempt');

    await useCase.execute({ id });

    expect(reserve).toHaveBeenCalledWith(unwrap(ShelfScanId.of(id)), own);
  });

  // FR-015: the photo stays kept and pending, to be run again once the day has turned.
  it('answers DailyScanQuotaExceeded once the day is used up, without calling the scanner', async () => {
    const scanner = scanning(books);
    const { id, storeAnother, repository, useCase } = await aStoredPhoto(scanner, {
      policy: { ...policy, dailyLimit: 1 },
    });
    await useCase.execute({ id });
    const second = await storeAnother();

    await expect(useCase.execute({ id: second })).resolves.toStrictEqual(
      err(new DailyScanQuotaExceeded(1)),
    );

    expect(scanner.seen).toHaveLength(1);
    expect((await repository.get(unwrap(ShelfScanId.of(second))))?.status).toBe('pending');
  });

  // Spec, Edge Cases: a double click, or two tabs, must not pay for two analyses.
  it('answers ShelfScanInProgress while another analysis of the scan is running', async () => {
    const scanner = scanning(books);
    const { id, repository, useCase } = await aStoredPhoto(scanner);
    const shelfScanId = unwrap(ShelfScanId.of(id));
    await repository.startAttempt(shelfScanId, policy);

    await expect(useCase.execute({ id })).resolves.toStrictEqual(
      err(new ShelfScanInProgress(shelfScanId)),
    );

    expect(scanner.seen).toHaveLength(0);
  });
});

// Whatever goes wrong once the attempt is reserved closes it (research.md §8, analysis U1):
// otherwise it would sit open for the whole lease, count against the day, and block the scan.
describe('ScanStoredShelfPhotoUseCase, when something other than the scanner fails', () => {
  /** A bucket that lost the photo — the object is not there. */
  const lostPhoto = new Error('no object at default/shelf_photo/…');

  it('records the scan as failed and closes the attempt when the photo cannot be read', async () => {
    const storage = new InMemoryShelfPhotoStorage();
    const { id, repository, useCase } = await aStoredPhoto(scanning(books), { storage });
    vi.spyOn(storage, 'retrieve').mockRejectedValue(lostPhoto);

    await expect(useCase.execute({ id })).rejects.toBe(lostPhoto);

    expect((await repository.get(unwrap(ShelfScanId.of(id))))?.status).toBe('failed');
    expect(repository.attempts.map((attempt) => attempt.finishedAt !== undefined)).toStrictEqual([
      true,
    ]);
  });

  it('closes the attempt as well when the scanner rejects instead of answering', async () => {
    const outage = new Error('socket hang up');
    const scanner: ShelfScannerPort = {
      scan: async () => {
        throw outage;
      },
    };
    const { id, repository, useCase } = await aStoredPhoto(scanner);

    await expect(useCase.execute({ id })).rejects.toBe(outage);

    expect((await repository.get(unwrap(ShelfScanId.of(id))))?.status).toBe('failed');
    expect(repository.attempts.map((attempt) => attempt.finishedAt !== undefined)).toStrictEqual([
      true,
    ]);
  });

  it('closes the attempt when the scanner answers with a failure', async () => {
    const { id, repository, useCase } = await aStoredPhoto(failing());

    await useCase.execute({ id });

    expect(repository.attempts.map((attempt) => attempt.finishedAt !== undefined)).toStrictEqual([
      true,
    ]);
  });
});
