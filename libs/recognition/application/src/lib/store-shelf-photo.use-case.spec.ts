import { InvalidShelfPhoto, OwnerId, ShelfScanId } from '@pick-a-book/recognition-domain';
import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { StoreShelfPhotoUseCase } from './store-shelf-photo.use-case.js';
import { InMemoryShelfPhotoStorage } from '../testing/in-memory-shelf-photo-storage.js';
import { InMemoryShelfScanRepository } from '../testing/in-memory-shelf-scan-repository.js';

const aJpeg = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
  mediaType: 'image/jpeg',
  originalFilename: 'IMG_0001.jpg',
};

function aUseCase(ownerId = 'default') {
  const storage = new InMemoryShelfPhotoStorage();
  const repository = new InMemoryShelfScanRepository();

  const useCase = new StoreShelfPhotoUseCase(unwrap(OwnerId.of(ownerId)), storage, repository);

  return { storage, repository, useCase };
}

describe('StoreShelfPhotoUseCase', () => {
  it('answers with a freshly generated id', async () => {
    const { useCase } = aUseCase();

    const { id } = unwrap(await useCase.execute(aJpeg));

    expect(unwrap(ShelfScanId.of(id)).value).toBe(id);
  });

  // research.md §10: the owner segment, then the kind of upload, then the id — never the
  // name of the uploaded file.
  it('stores the photo under {ownerId}/shelf_photo/{id}', async () => {
    const { storage, useCase } = aUseCase('someone');

    const { id } = unwrap(await useCase.execute(aJpeg));

    expect([...storage.objects.keys()]).toStrictEqual([`someone/shelf_photo/${id}`]);
    expect(storage.objects.get(`someone/shelf_photo/${id}`)?.bytes).toStrictEqual(aJpeg.bytes);
  });

  it('creates a pending record carrying the reference of the stored photo', async () => {
    const { repository, useCase } = aUseCase('someone');

    const { id } = unwrap(await useCase.execute(aJpeg));

    const record = await repository.get(unwrap(ShelfScanId.of(id)));
    expect(record).toMatchObject({
      ownerId: unwrap(OwnerId.of('someone')),
      photoBucketKey: `someone/shelf_photo/${id}`,
      photoMediaType: 'image/jpeg',
      photoSizeBytes: 6,
      originalFilename: 'IMG_0001.jpg',
      status: 'pending',
    });
  });

  // Two phones both name their photos IMG_0001.jpg: the key must not care (FR-015).
  it('never lets the original file name into the key', async () => {
    const { storage, useCase } = aUseCase();

    await useCase.execute({ ...aJpeg, originalFilename: '../../etc/passwd' });

    expect([...storage.objects.keys()].some((key) => key.includes('passwd'))).toBe(false);
  });
});

// US3, scenario 3 (FR-013): a photo refused before analysis leaves no trace at all.
describe('StoreShelfPhotoUseCase, with an image it refuses', () => {
  it.each([
    ['an empty image', { ...aJpeg, bytes: new Uint8Array(0) }, 'empty image'],
    [
      'an unsupported media type',
      { ...aJpeg, mediaType: 'application/pdf' },
      'unsupported media type (application/pdf) — expected image/jpeg, image/png, image/webp, image/heic',
    ],
    [
      'an image over 20 MB',
      { ...aJpeg, bytes: new Uint8Array(20 * 1024 * 1024 + 1) },
      'image too large (20971521 bytes, 20971520 at most)',
    ],
  ])('stores nothing for %s, and says why', async (_label, command, reason) => {
    const { storage, repository, useCase } = aUseCase();

    await expect(useCase.execute(command)).resolves.toStrictEqual(
      err(new InvalidShelfPhoto(reason)),
    );

    expect(storage.objects.size).toBe(0);
    expect(repository.records.size).toBe(0);
  });
});

const aThumbnail = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9]), mediaType: 'image/jpeg' };

// specs/002-upload-history, research.md §5, §6: the browser sends a smaller image along with the
// photo; it is kept under its own key, and referenced by the record.
describe('StoreShelfPhotoUseCase, with a thumbnail', () => {
  it('stores it under {ownerId}/shelf_photo_thumbnail/{id}, after the photo', async () => {
    const { storage, useCase } = aUseCase('someone');
    const photo = vi.spyOn(storage, 'store');
    const thumbnail = vi.spyOn(storage, 'storeThumbnail');

    const { id } = unwrap(await useCase.execute({ ...aJpeg, thumbnail: aThumbnail }));

    expect([...storage.thumbnails.keys()]).toStrictEqual([`someone/shelf_photo_thumbnail/${id}`]);
    expect(photo).toHaveBeenCalledBefore(thumbnail);
  });

  it('has the record reference it, by key, media type and weight', async () => {
    const { repository, useCase } = aUseCase('someone');

    const { id } = unwrap(await useCase.execute({ ...aJpeg, thumbnail: aThumbnail }));

    const record = await repository.get(unwrap(ShelfScanId.of(id)));
    expect(record?.thumbnail).toStrictEqual({
      bucketKey: `someone/shelf_photo_thumbnail/${id}`,
      mediaType: 'image/jpeg',
      sizeBytes: 5,
    });
  });

  it('answers with the id alone', async () => {
    const { useCase } = aUseCase();

    const result = unwrap(await useCase.execute({ ...aJpeg, thumbnail: aThumbnail }));

    expect(Object.keys(result)).toStrictEqual(['id']);
  });
});

// An unusable thumbnail never costs the user their photo: the upload goes on without it, and the
// history shows a neutral indicator (FR-008).
describe('StoreShelfPhotoUseCase, with a thumbnail it refuses', () => {
  it.each([
    ['an HEIC', { bytes: new Uint8Array([1]), mediaType: 'image/heic' }, 'unsupported media type'],
    [
      'a 300 KB one',
      { bytes: new Uint8Array(300_000), mediaType: 'image/jpeg' },
      'image too large',
    ],
    ['an empty one', { bytes: new Uint8Array(0), mediaType: 'image/jpeg' }, 'empty image'],
  ])('keeps the photo without it for %s, and says why', async (_label, thumbnail, reason) => {
    const { storage, repository, useCase } = aUseCase();

    const result = unwrap(await useCase.execute({ ...aJpeg, thumbnail }));

    expect(storage.objects.size).toBe(1);
    expect(storage.thumbnails.size).toBe(0);
    expect((await repository.get(unwrap(ShelfScanId.of(result.id))))?.thumbnail).toBeUndefined();
    expect(result.ignoredThumbnail).toContain(reason);
  });
});

describe('StoreShelfPhotoUseCase, with a thumbnail and a photo it refuses', () => {
  // FR-013 of spec 001: a photo refused before analysis leaves no trace — the thumbnail neither.
  it('stores neither', async () => {
    const { storage, repository, useCase } = aUseCase();

    const result = await useCase.execute({
      ...aJpeg,
      mediaType: 'application/pdf',
      thumbnail: aThumbnail,
    });

    expect(result.ok).toBe(false);
    expect(storage.objects.size + storage.thumbnails.size).toBe(0);
    expect(repository.records.size).toBe(0);
  });
});
