import {
  OwnerId,
  ShelfPhotoThumbnailNotFound,
  ShelfScanId,
  ShelfScanNotFound,
} from '@pick-a-book/recognition-domain';
import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { GetShelfPhotoImageUseCase } from './get-shelf-photo-image.use-case.js';
import { uploadPolicy } from './testing/scan-fixtures.js';
import { StoreShelfPhotoUseCase } from './store-shelf-photo.use-case.js';
import { InMemoryShelfPhotoStorage } from './testing/in-memory-shelf-photo-storage.js';
import { InMemoryShelfScanRepository } from './testing/in-memory-shelf-scan-repository.js';

const aJpeg = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
  mediaType: 'image/jpeg',
  originalFilename: 'IMG_0001.jpg',
};
const aThumbnail = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xdb]), mediaType: 'image/webp' };

const owner = unwrap(OwnerId.of('default'));

/** A scan stored with the photo and, when asked, its thumbnail; and the use case over the same ports. */
async function aStoredScan(options: { readonly thumbnail: boolean }) {
  const storage = new InMemoryShelfPhotoStorage();
  const repository = new InMemoryShelfScanRepository();
  const { id } = unwrap(
    await new StoreShelfPhotoUseCase(owner, storage, repository, uploadPolicy).execute({
      ...aJpeg,
      ...(options.thumbnail ? { thumbnail: aThumbnail } : {}),
    }),
  );

  return {
    id,
    storage,
    repository,
    useCase: new GetShelfPhotoImageUseCase(owner, storage, repository),
  };
}

// What the history shows of a scan, read back from the bucket (specs/002-upload-history, US1).
describe('GetShelfPhotoImageUseCase, for a thumbnail', () => {
  it('answers its bytes and its media type', async () => {
    const { id, useCase } = await aStoredScan({ thumbnail: true });

    const image = unwrap(await useCase.execute({ id, kind: 'thumbnail' }));

    expect(image).toStrictEqual({ bytes: aThumbnail.bytes, mediaType: 'image/webp' });
  });

  it('answers ShelfPhotoThumbnailNotFound for a scan sent without one', async () => {
    const { id, useCase } = await aStoredScan({ thumbnail: false });

    await expect(useCase.execute({ id, kind: 'thumbnail' })).resolves.toStrictEqual(
      err(new ShelfPhotoThumbnailNotFound(id)),
    );
  });
});

// US2: the photo itself, in the type it was sent in — kept as it came, whatever the browser can show.
describe('GetShelfPhotoImageUseCase, for the photo', () => {
  it('answers its bytes and the media type it was stored with', async () => {
    const { id, useCase } = await aStoredScan({ thumbnail: false });

    const image = unwrap(await useCase.execute({ id, kind: 'photo' }));

    expect(image).toStrictEqual({ bytes: aJpeg.bytes, mediaType: 'image/jpeg' });
  });

  // A bucket that fails is not an expected failure of the domain: it rejects (ADR 0013), and the
  // HTTP boundary says 502 for it (contract §3).
  it('lets a storage failure through, as it is', async () => {
    const { id, storage, useCase } = await aStoredScan({ thumbnail: false });
    const failure = new Error('could not retrieve default/shelf_photo/…');
    vi.spyOn(storage, 'retrieve').mockRejectedValue(failure);

    await expect(useCase.execute({ id, kind: 'photo' })).rejects.toBe(failure);
  });

  it('answers ShelfScanNotFound for an id it does not know', async () => {
    const { useCase } = await aStoredScan({ thumbnail: false });
    const id = ShelfScanId.generate().value;

    await expect(useCase.execute({ id, kind: 'photo' })).resolves.toStrictEqual(
      err(new ShelfScanNotFound(id)),
    );
  });
});

describe('GetShelfPhotoImageUseCase, for a scan that is not there', () => {
  // The same 404 whether the id is unknown, malformed, or someone else's (FR-012).
  it.each([
    ['an unknown UUID', ShelfScanId.generate().value],
    ['a malformed id', 'not-a-uuid'],
  ])('answers ShelfScanNotFound for %s', async (_label, id) => {
    const { useCase } = await aStoredScan({ thumbnail: true });

    await expect(useCase.execute({ id, kind: 'thumbnail' })).resolves.toStrictEqual(
      err(new ShelfScanNotFound(id)),
    );
  });

  it("answers ShelfScanNotFound for another owner's scan", async () => {
    const { id, repository } = await aStoredScan({ thumbnail: true });
    const stranger = new GetShelfPhotoImageUseCase(
      unwrap(OwnerId.of('someone-else')),
      new InMemoryShelfPhotoStorage(),
      repository,
    );

    await expect(stranger.execute({ id, kind: 'thumbnail' })).resolves.toStrictEqual(
      err(new ShelfScanNotFound(id)),
    );
  });
});
