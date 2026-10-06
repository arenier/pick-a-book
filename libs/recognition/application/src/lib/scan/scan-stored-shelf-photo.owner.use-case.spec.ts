import { OwnerId, ShelfScanId, ShelfScanNotFound } from '@pick-a-book/recognition-domain';
import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aStoredPhoto, books, scanning } from '../testing/scan-fixtures.js';

/**
 * Running an analysis is the owner's alone (specs/002-upload-history, FR-012): the scan of someone
 * else is answered like one that does not exist, and costs nothing — no call to the scanner, no
 * attempt on the cap.
 */
const stranger = unwrap(OwnerId.of('someone-else'));

describe('ScanStoredShelfPhotoUseCase, the scan of someone else', () => {
  it('is answered as unknown', async () => {
    const { id, scanAs } = await aStoredPhoto(scanning(books));

    await expect(scanAs(stranger).execute({ id })).resolves.toStrictEqual(
      err(new ShelfScanNotFound(id)),
    );
  });

  it('never reaches the scanner, nor takes an attempt', async () => {
    const scanner = scanning(books);
    const { id, repository, scanAs } = await aStoredPhoto(scanner);

    await scanAs(stranger).execute({ id });

    expect(scanner.seen).toHaveLength(0);
    expect(repository.attempts).toHaveLength(0);
  });

  it('leaves the scan as it was', async () => {
    const { id, repository, scanAs } = await aStoredPhoto(scanning(books));

    await scanAs(stranger).execute({ id });

    expect((await repository.get(unwrap(ShelfScanId.of(id))))?.status).toBe('pending');
  });

  it('still lets its owner run it', async () => {
    const { id, useCase } = await aStoredPhoto(scanning(books));

    expect((await useCase.execute({ id })).ok).toBe(true);
  });
});
