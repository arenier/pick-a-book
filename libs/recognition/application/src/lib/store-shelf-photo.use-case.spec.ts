import { ShelfScanId } from '@pick-a-book/recognition-domain';
import { describe, expect, it } from 'vitest';

import { StoreShelfPhotoUseCase } from './store-shelf-photo.use-case.js';
import { InMemoryShelfPhotoStorage } from './testing/in-memory-shelf-photo-storage.js';
import { InMemoryShelfScanRepository } from './testing/in-memory-shelf-scan-repository.js';

const aJpeg = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
  mediaType: 'image/jpeg',
  originalFilename: 'IMG_0001.jpg',
};

function aUseCase(ownerId = 'default') {
  const storage = new InMemoryShelfPhotoStorage();
  const repository = new InMemoryShelfScanRepository();

  return { storage, repository, useCase: new StoreShelfPhotoUseCase(ownerId, storage, repository) };
}

describe('StoreShelfPhotoUseCase', () => {
  it('answers with a freshly generated id', async () => {
    const { useCase } = aUseCase();

    const { id } = await useCase.execute(aJpeg);

    expect(ShelfScanId.of(id).value).toBe(id);
  });

  // research.md §10: the owner segment, then the kind of upload, then the id — never the
  // name of the uploaded file.
  it('stores the photo under {ownerId}/shelf_photo/{id}', async () => {
    const { storage, useCase } = aUseCase('someone');

    const { id } = await useCase.execute(aJpeg);

    expect([...storage.objects.keys()]).toStrictEqual([`someone/shelf_photo/${id}`]);
    expect(storage.objects.get(`someone/shelf_photo/${id}`)?.bytes).toStrictEqual(aJpeg.bytes);
  });

  it('creates a pending record carrying the reference of the stored photo', async () => {
    const { repository, useCase } = aUseCase('someone');

    const { id } = await useCase.execute(aJpeg);

    const record = await repository.get(ShelfScanId.of(id));
    expect(record).toMatchObject({
      ownerId: 'someone',
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
