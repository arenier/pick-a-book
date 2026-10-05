import {
  ShelfScanAlreadyProcessed,
  ShelfScanFailed,
  ShelfScanId,
} from '@pick-a-book/recognition-domain';
import { err, ok, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aStoredPhoto, books, failing } from '../testing/scan-fixtures.js';

/**
 * Running the analysis of a scan again (specs/002-upload-history, US3, FR-011): allowed for a scan
 * that has no books — it failed, or never started — and never for one that has them.
 */
const down = () => err(new ShelfScanFailed('provider unavailable'));

describe('ScanStoredShelfPhotoUseCase, running a failed scan again', () => {
  it('completes it, with its books, once the service is back', async () => {
    const scanner = failing();
    const { id, repository, useCase } = await aStoredPhoto(scanner);
    await useCase.execute({ id });
    scanner.answerWith(ok([...books]));

    const answer = await useCase.execute({ id });

    expect(answer.ok).toBe(true);
    const record = await repository.get(unwrap(ShelfScanId.of(id)));
    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual(books);
  });

  it('keeps it failed, and says why, when the service is still down', async () => {
    const scanner = failing();
    const { id, repository, useCase } = await aStoredPhoto(scanner);
    await useCase.execute({ id });

    await expect(useCase.execute({ id })).resolves.toStrictEqual(down());

    expect((await repository.get(unwrap(ShelfScanId.of(id))))?.status).toBe('failed');
    expect(scanner.seen).toHaveLength(2);
  });

  // Each analysis is an attempt of its own, and each one is closed: a failed scan is never stuck
  // « in progress » for the minutes of a lease.
  it('records an attempt for each analysis, all of them closed', async () => {
    const scanner = failing();
    const { id, repository, useCase } = await aStoredPhoto(scanner);
    await useCase.execute({ id });
    await useCase.execute({ id });

    expect(repository.attempts.map((attempt) => attempt.finishedAt !== undefined)).toStrictEqual([
      true,
      true,
    ]);
  });
});

describe('ScanStoredShelfPhotoUseCase, running a completed scan again', () => {
  // The books are final: a second analysis would pay for a call, and could change them.
  it('answers ShelfScanAlreadyProcessed, without calling the scanner again', async () => {
    const scanner = failing();
    scanner.answerWith(ok([...books]));
    const { id, useCase } = await aStoredPhoto(scanner);
    await useCase.execute({ id });

    await expect(useCase.execute({ id })).resolves.toStrictEqual(
      err(new ShelfScanAlreadyProcessed(unwrap(ShelfScanId.of(id)))),
    );

    expect(scanner.seen).toHaveLength(1);
  });
});

describe('ScanStoredShelfPhotoUseCase, running a scan that never started', () => {
  it('runs it, like a scan that failed', async () => {
    const scanner = failing();
    scanner.answerWith(ok([...books]));
    const { id, repository, useCase } = await aStoredPhoto(scanner);

    await useCase.execute({ id });

    expect((await repository.get(unwrap(ShelfScanId.of(id))))?.status).toBe('completed');
  });
});
