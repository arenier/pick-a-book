import {
  ShelfScanAlreadyProcessed,
  ShelfScanFailed,
  ShelfScanId,
  ShelfScanNotFound,
} from '@pick-a-book/recognition-domain';
import { err, ok, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { aJpeg, aStoredPhoto, books, failing, scanning } from './testing/scan-fixtures.js';

describe('ScanStoredShelfPhotoUseCase', () => {
  it('scans the photo stored under the id', async () => {
    const scanner = scanning(books);
    const { id, useCase } = await aStoredPhoto(scanner);

    await useCase.execute({ id });

    expect(scanner.seen).toHaveLength(1);
    expect(scanner.seen[0]?.bytes).toStrictEqual(aJpeg.bytes);
    expect(scanner.seen[0]?.mediaType).toBe('image/jpeg');
  });

  it('answers with the detected books as boundary DTOs', async () => {
    const { id, useCase } = await aStoredPhoto(scanning(books));

    await expect(useCase.execute({ id })).resolves.toStrictEqual(
      ok({
        books: [
          { author: 'Annie Ernaux', title: 'Les Annees', confidence: 0.91 },
          { author: undefined, title: 'Les Choses', confidence: 0.4 },
        ],
      }),
    );
  });

  it('records the scan as completed, with its books', async () => {
    const { id, repository, useCase } = await aStoredPhoto(scanning(books));

    await useCase.execute({ id });

    const record = await repository.get(unwrap(ShelfScanId.of(id)));
    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual(books);
  });

  // "No book detected" is a result (US1, scenario 3), not an error.
  it('completes with an empty list when nothing is readable', async () => {
    const { id, repository, useCase } = await aStoredPhoto(scanning([]));

    await expect(useCase.execute({ id })).resolves.toStrictEqual(ok({ books: [] }));
    expect((await repository.get(unwrap(ShelfScanId.of(id))))?.status).toBe('completed');
  });
});

describe('ScanStoredShelfPhotoUseCase, when the scanner fails', () => {
  // Passed through as is: HTTP maps it to 502, where "no book detected" would lie (FR-006).
  it('answers with the scanner failure', async () => {
    const { id, useCase } = await aStoredPhoto(failing());

    await expect(useCase.execute({ id })).resolves.toStrictEqual(
      err(new ShelfScanFailed('provider unavailable')),
    );
  });

  // US3, scenario 2: the photo is kept, and its record says the scan failed (FR-011).
  it('records the scan as failed, never as completed', async () => {
    const { id, repository, useCase } = await aStoredPhoto(failing());

    await useCase.execute({ id });

    const record = await repository.get(unwrap(ShelfScanId.of(id)));
    expect(record?.status).toBe('failed');
    expect(record?.detectedBooks).toBeUndefined();
  });
});

// The scanner failure is what HTTP reports (502): a database hiccup while recording it must
// not turn it into a generic 500. The record then stays pending — a state the spec allows.
describe('ScanStoredShelfPhotoUseCase, when recording the failure fails too', () => {
  it('still answers with the scanner failure, and logs the one it could not record', async () => {
    const { id, repository, useCase } = await aStoredPhoto(failing());
    vi.spyOn(repository, 'markFailed').mockRejectedValue(new Error('database unavailable'));
    const log = vi.spyOn(console, 'error').mockReturnValue();

    await expect(useCase.execute({ id })).resolves.toStrictEqual(
      err(new ShelfScanFailed('provider unavailable')),
    );

    expect(log).toHaveBeenCalledWith(
      `Could not record the failed scan of ${id}; it stays pending`,
      new Error('database unavailable'),
    );
    log.mockRestore();
  });

  // Another request settled the record while the scanner was answering: the transition said
  // no. Nothing to retry, but the caller still hears about the scanner.
  it('logs a record that was settled in the meantime, and still answers with the failure', async () => {
    const { id, repository, useCase } = await aStoredPhoto(failing());
    const settled = err(new ShelfScanAlreadyProcessed(unwrap(ShelfScanId.of(id))));
    vi.spyOn(repository, 'markFailed').mockResolvedValue(settled);
    const log = vi.spyOn(console, 'error').mockReturnValue();

    await expect(useCase.execute({ id })).resolves.toStrictEqual(
      err(new ShelfScanFailed('provider unavailable')),
    );

    expect(log).toHaveBeenCalledWith(
      `Could not record the failed scan of ${id}; it stays pending`,
      settled.error,
    );
    log.mockRestore();
  });
});

describe('ScanStoredShelfPhotoUseCase, for an id it cannot scan', () => {
  // Mapped to 404: an id that is not even a UUID is just as unknown.
  it.each([
    ['an unknown UUID', ShelfScanId.generate().value],
    ['a malformed id', 'not-a-uuid'],
  ])('answers ShelfScanNotFound for %s', async (_label, unknownId) => {
    const scanner = scanning(books);
    const { useCase } = await aStoredPhoto(scanner);

    await expect(useCase.execute({ id: unknownId })).resolves.toStrictEqual(
      err(new ShelfScanNotFound(unknownId)),
    );
    expect(scanner.seen).toHaveLength(0);
  });

  // Mapped to 409 (research.md §7): a second scan would overwrite a result, or pay for a
  // VLM call nobody asked for.
  it('answers ShelfScanAlreadyProcessed for a scan already completed, without calling the scanner again', async () => {
    const scanner = scanning(books);
    const { id, useCase } = await aStoredPhoto(scanner);
    await useCase.execute({ id });

    await expect(useCase.execute({ id })).resolves.toStrictEqual(
      err(new ShelfScanAlreadyProcessed(unwrap(ShelfScanId.of(id)))),
    );
    expect(scanner.seen).toHaveLength(1);
  });
});
